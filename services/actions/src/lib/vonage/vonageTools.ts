import { gql } from "@apollo/client/core";
import { DeleteAttendeeCommand } from "@aws-sdk/client-chime";
import { VonageSessionLayoutData, VonageSessionLayoutType } from "@clowdr-app/shared-types/build/vonage";
import { is } from "typescript-is";
import {
    CreateEventParticipantStreamDocument,
    GetEventBroadcastDetailsDocument,
    GetEventByVonageSessionIdDocument,
    RemoveEventParticipantStreamDocument,
    Video_RtmpInput_Enum,
} from "../../generated/graphql";
import { apolloClient } from "../../graphqlClient";
import { StreamData } from "../../types/vonage";
import { callWithRetry } from "../../utils";
import { Chime, shortId } from "../aws/awsClient";
import { getRoomParticipantDetails, removeRoomParticipant } from "../roomParticipant";
import Vonage from "./vonageClient";

async function getStartedBroadcastIds(vonageSessionId: string): Promise<string[]> {
    const broadcasts = await Vonage.listBroadcasts({
        sessionId: vonageSessionId,
    });

    return broadcasts?.filter((broadcast) => broadcast.status === "started").map((broadcast) => broadcast.id) ?? [];
}

gql`
    query GetEventBroadcastDetails($eventId: uuid!) {
        schedule_Event_by_pk(id: $eventId) {
            id
            startTime
            durationSeconds
            endTime
            intendedRoomModeName
            room {
                id
                channelStack {
                    rtmpAInputUri
                    rtmpBInputUri
                    id
                }
            }
            eventVonageSession {
                sessionId
                id
                rtmpInputName
                eventVonageSessionLayouts(limit: 1, order_by: { created_at: desc }) {
                    id
                    layoutData
                }
            }
        }
    }
`;

interface EventBroadcastDetails {
    rtmpServerUrl: string;
    rtmpStreamName: string;
    vonageSessionId: string;
    currentLayout: VonageLayout;
}

export interface VonageLayout {
    streamClasses: {
        [streamId: string]: string[];
    };
    layout: VonageLayoutCustom | VonageLayoutBuiltin;
}

export interface VonageLayoutCustom {
    type: "custom";
    stylesheet: string;
}

export interface VonageLayoutBuiltin {
    type: "bestFit";
    screenShareType: "verticalPresentation";
}

export async function applyVonageBroadcastLayout(vonageSessionId: string, layout: VonageLayout): Promise<void> {
    const streams = await Vonage.listStreams(vonageSessionId);
    if (!streams) {
        console.error("Could not retrieve list of streams from Vonage", { vonageSessionId });
        throw new Error("Could not retrieve list of streams from Vonage");
    }

    const invalidStreamClasses = Object.keys(layout.streamClasses).filter(
        (streamId) => !streams.some((s) => s.id === streamId)
    );

    if (invalidStreamClasses.length) {
        console.error(
            "Cannot apply Vonage layout, found invalid streams",
            JSON.stringify({
                vonageSessionId,
                invalidStreams: Object.entries(layout.streamClasses).filter(([streamId]) =>
                    invalidStreamClasses.some((s) => s === streamId)
                ),
            })
        );
        throw new Error("Could not apply Vonage layout, found invalid streams");
    }

    const streamsToClear = streams
        .filter((stream) => stream.layoutClassList.length)
        .filter((stream) => !Object.keys(layout.streamClasses).includes(stream.id))
        .map((stream) => ({
            id: stream.id,
            layoutClassList: [] as string[],
        }));
    const streamsToSet = Object.entries(layout.streamClasses).map(([streamId, classes]) => ({
        id: streamId,
        layoutClassList: classes,
    }));

    await Vonage.setStreamClassLists(vonageSessionId, streamsToClear.concat(streamsToSet));
    const startedBroadcastIds = await getStartedBroadcastIds(vonageSessionId);

    console.log("Setting layout of Vonage broadcasts", { vonageSessionId, startedBroadcastIds });
    for (const startedBroadcastId of startedBroadcastIds) {
        try {
            switch (layout.layout.type) {
                case "bestFit":
                    await Vonage.setBroadcastLayout(startedBroadcastId, "bestFit", null, "verticalPresentation");
                    break;
                case "custom":
                    await Vonage.setBroadcastLayout(startedBroadcastId, "custom", layout.layout.stylesheet, null);
                    break;
            }
        } catch (err) {
            console.error("Failed to set layout for Vonage broadcast", {
                vonageSessionId,
                startedBroadcastId,
                err,
            });
        }
    }
}

export function convertLayout(layoutData: VonageSessionLayoutData): VonageLayout {
    switch (layoutData.type) {
        case VonageSessionLayoutType.BestFit:
            return {
                layout: {
                    type: "bestFit",
                    screenShareType: "verticalPresentation",
                },
                streamClasses: {},
            };
        case VonageSessionLayoutType.Pair:
            return {
                layout: {
                    type: "custom",
                    stylesheet:
                        "stream.left {display: block; position: absolute; width: 50%; height: 100%; left: 0;} stream.right {position: absolute; width: 50%; height: 100%; right: 0;}",
                },
                streamClasses: {
                    [layoutData.leftStreamId]: ["left"],
                    [layoutData.rightStreamId]: ["right"],
                },
            };
        case VonageSessionLayoutType.PictureInPicture:
            return {
                layout: {
                    type: "custom",
                    stylesheet:
                        "stream.focus {display: block; position: absolute; width: 100%; height: 100%; left: 0; z-index: 100;} stream.corner {display: block; position: absolute; width: 15%; height: 15%; right: 2%; bottom: 3%; z-index: 200;}",
                },
                streamClasses: {
                    [layoutData.focusStreamId]: ["focus"],
                    [layoutData.cornerStreamId]: ["corner"],
                },
            };
        case VonageSessionLayoutType.Single:
            return {
                layout: {
                    type: "custom",
                    stylesheet:
                        "stream.focus {display: block; position: absolute; width: 100%; height: 100%; left: 0;}",
                },
                streamClasses: {
                    [layoutData.focusStreamId]: ["focus"],
                },
            };
    }
}

export async function getEventBroadcastDetails(eventId: string): Promise<EventBroadcastDetails> {
    const eventResult = await apolloClient.query({
        query: GetEventBroadcastDetailsDocument,
        variables: {
            eventId,
        },
    });

    if (!eventResult.data.schedule_Event_by_pk) {
        throw new Error("Could not find event");
    }

    if (!eventResult.data.schedule_Event_by_pk.eventVonageSession) {
        throw new Error("Could not find event Vonage session");
    }

    if (!eventResult.data.schedule_Event_by_pk.room.channelStack) {
        throw new Error("Could not find MediaLive channel for event");
    }

    const rtmpUri =
        eventResult.data.schedule_Event_by_pk.eventVonageSession.rtmpInputName === Video_RtmpInput_Enum.RtmpB
            ? eventResult.data.schedule_Event_by_pk.room.channelStack?.rtmpBInputUri ??
              eventResult.data.schedule_Event_by_pk.room.channelStack.rtmpAInputUri
            : eventResult.data.schedule_Event_by_pk.room.channelStack.rtmpAInputUri;

    const rtmpUriParts = rtmpUri.split("/");
    if (rtmpUriParts.length < 2) {
        throw new Error("RTMP Push URI has unexpected format");
    }
    const streamName = rtmpUriParts[rtmpUriParts.length - 1];
    const serverUrl = rtmpUri.substring(0, rtmpUri.length - streamName.length);

    if (!eventResult.data.schedule_Event_by_pk.eventVonageSession?.sessionId) {
        throw new Error("Could not find Vonage session ID for event");
    }

    let currentLayout: VonageLayout = {
        streamClasses: {},
        layout: {
            type: "bestFit",
            screenShareType: "verticalPresentation",
        },
    };
    if (eventResult.data.schedule_Event_by_pk.eventVonageSession.eventVonageSessionLayouts.length) {
        try {
            const layoutData =
                eventResult.data.schedule_Event_by_pk.eventVonageSession.eventVonageSessionLayouts[0].layoutData;
            if (is<VonageSessionLayoutData>(layoutData)) {
                currentLayout = convertLayout(layoutData);
            }
        } catch {
            console.log("Invalid layout found when retrieving event broadcast details", {
                eventId,
                eventVonageSessionLayoutId:
                    eventResult.data.schedule_Event_by_pk.eventVonageSession.eventVonageSessionLayouts[0].id,
            });
        }
    }

    return {
        rtmpServerUrl: serverUrl,
        rtmpStreamName: streamName,
        vonageSessionId: eventResult.data.schedule_Event_by_pk.eventVonageSession.sessionId,
        currentLayout,
    };
}

export async function startEventBroadcast(eventId: string): Promise<void> {
    let broadcastDetails: EventBroadcastDetails;
    try {
        broadcastDetails = await callWithRetry(async () => await getEventBroadcastDetails(eventId));
    } catch (err) {
        console.error("Error retrieving Vonage broadcast details for event", { eventId, err });
        return;
    }

    const existingSessionBroadcasts = await callWithRetry(
        async () =>
            await Vonage.listBroadcasts({
                sessionId: broadcastDetails.vonageSessionId,
            })
    );

    if (!existingSessionBroadcasts) {
        console.error("Could not retrieve existing session broadcasts.", broadcastDetails.vonageSessionId);
        return;
    }

    const startedSessionBroadcasts = existingSessionBroadcasts?.filter((broadcast) => broadcast.status === "started");

    console.log(
        `Vonage session has ${startedSessionBroadcasts.length} existing live broadcasts`,
        broadcastDetails.vonageSessionId,
        startedSessionBroadcasts
    );

    if (startedSessionBroadcasts.length > 1) {
        console.warn(
            "Found more than one live broadcast for session - which is not allowed. Stopping them.",
            broadcastDetails.vonageSessionId
        );
        for (const broadcast of startedSessionBroadcasts) {
            try {
                await Vonage.stopBroadcast(broadcast.id);
            } catch (e) {
                console.error(
                    "Error while stopping invalid broadcast",
                    broadcastDetails.vonageSessionId,
                    broadcast.status,
                    e
                );
            }
        }
    }

    const existingBroadcast = startedSessionBroadcasts.find((broadcast) =>
        broadcast.broadcastUrls.rtmp?.find(
            (destination) =>
                destination.serverUrl === broadcastDetails.rtmpServerUrl &&
                destination.streamName === broadcastDetails.rtmpStreamName
        )
    );

    if (!existingBroadcast) {
        const rtmpId = shortId();
        console.log("Starting a broadcast from session to event room", {
            vonageSessionId: broadcastDetails.vonageSessionId,
            eventId,
            rtmpId,
        });
        try {
            const broadcast = await Vonage.startBroadcast(broadcastDetails.vonageSessionId, {
                layout: broadcastDetails.currentLayout.layout,
                outputs: {
                    rtmp: [
                        {
                            id: rtmpId,
                            serverUrl: broadcastDetails.rtmpServerUrl,
                            streamName: broadcastDetails.rtmpStreamName,
                        },
                    ],
                },
                resolution: "1280x720",
            });
            console.log("Started Vonage RTMP broadcast", {
                broadcastId: broadcast.id,
                vonageSessionId: broadcastDetails.vonageSessionId,
                eventId,
            });
        } catch (err) {
            console.error("Failed to start broadcast", {
                vonageSessionId: broadcastDetails.vonageSessionId,
                eventId,
                err,
            });
            return;
        }
    } else {
        console.log("There is already an existing RTMP broadcast from the session to the ongoing event.", {
            vonageSessionId: broadcastDetails.vonageSessionId,
            eventId,
        });
    }
}

export async function stopEventBroadcasts(eventId: string): Promise<void> {
    let broadcastDetails: EventBroadcastDetails;
    try {
        broadcastDetails = await callWithRetry(async () => await getEventBroadcastDetails(eventId));
    } catch (e) {
        console.error("Error retrieving Vonage broadcast details for event", e);
        return;
    }

    const existingSessionBroadcasts = await callWithRetry(
        async () =>
            await Vonage.listBroadcasts({
                sessionId: broadcastDetails.vonageSessionId,
            })
    );

    if (!existingSessionBroadcasts) {
        console.error("Could not retrieve existing session broadcasts.", broadcastDetails.vonageSessionId);
        return;
    }

    for (const existingBroadcast of existingSessionBroadcasts) {
        try {
            if (existingBroadcast.status === "started") {
                await callWithRetry(async () => await Vonage.stopBroadcast(existingBroadcast.id));
            }
        } catch (e) {
            console.error("Could not stop existing session broadcast", eventId, existingBroadcast.id, e);
        }
    }
}

export async function kickRegistrantFromRoom(roomId: string, registrantId: string): Promise<void> {
    const roomParticipants = await getRoomParticipantDetails(roomId, registrantId);

    if (roomParticipants.length !== 1) {
        console.error("Could not find a room participant to kick", roomId, registrantId);
        throw new Error("Could not find a room participant to kick");
    }

    const roomParticipant = roomParticipants[0];

    if (roomParticipant.vonageConnectionId) {
        if (!roomParticipant.room.publicVonageSessionId) {
            console.warn("Could not find Vonage session to kick participant from", { roomId, registrantId });
        } else {
            console.log("Forcing Vonage disconnection of registrant", { roomId, registrantId });
            try {
                await Vonage.forceDisconnect(
                    roomParticipant.room.publicVonageSessionId,
                    roomParticipant.vonageConnectionId
                );
            } catch (err) {
                console.error("Failed to force Vonage disconnection of registrant", { roomId, registrantId, err });
                throw new Error("Failed to force Vonage disconnection of registrant");
            }
        }

        await removeRoomParticipant(roomId, roomParticipant.room.conferenceId, registrantId);
    } else if (roomParticipant.chimeRegistrantId) {
        if (!roomParticipant.room.chimeMeeting) {
            console.warn("Could not find Chime session to kick participant from", { roomId, registrantId });
        } else {
            console.log("Forcing Chime disconnection of registrant", { roomId, registrantId });
            try {
                await Chime.send(
                    new DeleteAttendeeCommand({
                        AttendeeId: roomParticipant.chimeRegistrantId,
                        MeetingId: roomParticipant.room.chimeMeeting.chimeMeetingId,
                    })
                );
            } catch (err) {
                console.error("Failed to force Chime disconnection of registrant", { roomId, registrantId, err });
                throw new Error("Failed to force Chime disconnection of registrant");
            }
        }

        await removeRoomParticipant(roomId, roomParticipant.room.conferenceId, registrantId);
    }
}

gql`
    query GetEventByVonageSessionId($sessionId: String!) {
        schedule_Event(where: { eventVonageSession: { sessionId: { _eq: $sessionId } } }) {
            id
            conferenceId
        }
    }

    mutation CreateEventParticipantStream(
        $registrantId: uuid!
        $conferenceId: uuid!
        $eventId: uuid!
        $vonageConnectionId: String!
        $vonageStreamId: String!
        $vonageStreamType: String!
    ) {
        insert_video_EventParticipantStream_one(
            object: {
                registrantId: $registrantId
                conferenceId: $conferenceId
                eventId: $eventId
                vonageConnectionId: $vonageConnectionId
                vonageStreamId: $vonageStreamId
                vonageStreamType: $vonageStreamType
            }
        ) {
            id
        }
    }
`;

export async function addEventParticipantStream(
    sessionId: string,
    registrantId: string,
    stream: StreamData
): Promise<void> {
    const eventResult = await apolloClient.query({
        query: GetEventByVonageSessionIdDocument,
        variables: {
            sessionId,
        },
    });

    if (eventResult.error || eventResult.errors) {
        console.error("Error while retrieving event from Vonage session ID", sessionId, registrantId);
        throw new Error("Error while retrieving event from Vonage session ID");
    }

    if (eventResult.data.schedule_Event.length !== 1) {
        console.log("No event matching this session, skipping participant addition.", sessionId, registrantId);
        return;
    }

    try {
        await apolloClient.mutate({
            mutation: CreateEventParticipantStreamDocument,
            variables: {
                registrantId,
                conferenceId: eventResult.data.schedule_Event[0].conferenceId,
                eventId: eventResult.data.schedule_Event[0].id,
                vonageConnectionId: stream.connection.id,
                vonageStreamId: stream.id,
                vonageStreamType: stream.videoType ?? "camera",
            },
        });
    } catch (e) {
        // If there is already a row for this event, kick the previous connection before recording the new one
        console.error(
            "Error while adding event participant stream",
            eventResult.data.schedule_Event[0].id,
            registrantId,
            stream.id,
            e
        );
        throw new Error("Error while adding event participant stream");
    }
}

gql`
    mutation RemoveEventParticipantStream(
        $registrantId: uuid!
        $conferenceId: uuid!
        $eventId: uuid!
        $vonageConnectionId: String!
        $vonageStreamId: String!
    ) {
        delete_video_EventParticipantStream(
            where: {
                registrantId: { _eq: $registrantId }
                conferenceId: { _eq: $conferenceId }
                eventId: { _eq: $eventId }
                vonageConnectionId: { _eq: $vonageConnectionId }
                vonageStreamId: { _eq: $vonageStreamId }
            }
        ) {
            affected_rows
        }
    }
`;

export async function removeEventParticipantStream(
    sessionId: string,
    registrantId: string,
    stream: StreamData
): Promise<void> {
    const eventResult = await apolloClient.query({
        query: GetEventByVonageSessionIdDocument,
        variables: {
            sessionId,
        },
    });

    if (eventResult.error || eventResult.errors) {
        console.log("Could not retrieve event from Vonage session ID", sessionId, registrantId);
        throw new Error("Could not retrieve event from Vonage session ID");
    }

    if (eventResult.data.schedule_Event.length !== 1) {
        console.log("No event matching this session, skipping participant stream removal.", sessionId, registrantId);
        return;
    }

    const removeResult = await apolloClient.mutate({
        mutation: RemoveEventParticipantStreamDocument,
        variables: {
            registrantId,
            conferenceId: eventResult.data.schedule_Event[0].conferenceId,
            eventId: eventResult.data.schedule_Event[0].id,
            vonageConnectionId: stream.connection.id,
            vonageStreamId: stream.id,
        },
    });

    if (
        !removeResult.data?.delete_video_EventParticipantStream?.affected_rows ||
        removeResult.data.delete_video_EventParticipantStream.affected_rows === 0
    ) {
        console.warn("Could not find participant stream to remove for event", sessionId, registrantId, stream.id);
    }
}
