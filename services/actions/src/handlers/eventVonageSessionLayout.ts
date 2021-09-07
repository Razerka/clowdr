import { gql } from "@apollo/client/core";
import { VonageSessionLayoutType } from "@clowdr-app/shared-types/build/vonage";
import assert from "assert";
import {
    EventVonageSessionLayout_GetSessionIdFromEventIdDocument,
    EventVonageSession_RemoveInvalidStreamsDocument,
} from "../generated/graphql";
import { apolloClient } from "../graphqlClient";
import Vonage from "../lib/vonage/vonageClient";
import { EventVonageSessionLayoutData, Payload } from "../types/hasura/event";

interface EventVonageSessionDetails {
    /** The (Vonage-internal) IDs of all streams that currently exist in the session. */
    validStreamIds: string[];
    /** The (Vonage-internal) session ID. */
    vonageSessionId: string;
    /** Our event ID for the associated event. */
    eventId: string;
}

async function getDetailsFromEventVonageSession(eventVonageSessionId: string): Promise<EventVonageSessionDetails> {
    gql`
        query EventVonageSessionLayout_GetSessionIdFromEventId($eventVonageSessionId: uuid!) {
            video_EventVonageSession_by_pk(id: $eventVonageSessionId) {
                id
                sessionId
                event {
                    id
                }
            }
        }
    `;

    const result = await apolloClient.query({
        query: EventVonageSessionLayout_GetSessionIdFromEventIdDocument,
        variables: {
            eventVonageSessionId,
        },
    });

    if (!result.data.video_EventVonageSession_by_pk?.sessionId) {
        throw new Error("Could not find a Vonage session associated with the event");
    }

    if (!result.data.video_EventVonageSession_by_pk.event.id) {
        throw new Error("Could not find an event ID for the event vonage session");
    }

    const vonageSessionId = result.data.video_EventVonageSession_by_pk.sessionId;
    const eventId = result.data.video_EventVonageSession_by_pk.event.id;

    console.log("Attempting to remove invalid EventParticipantStreams", { eventId, vonageSessionId });
    const streams = await Vonage.listStreams(vonageSessionId);

    if (!streams) {
        throw new Error("Did not get list of streams from Vonage");
    }

    const validStreamIds = streams.map((stream) => stream.id);
    return { validStreamIds, eventId, vonageSessionId };
}

async function removeInvalidEventParticipantStreams(validStreamIds: string[], eventId: string) {
    gql`
        mutation EventVonageSession_RemoveInvalidStreams($validStreamIds: [String!]!, $eventId: uuid) {
            delete_video_EventParticipantStream(
                where: { vonageStreamId: { _nin: $validStreamIds }, eventId: { _eq: $eventId } }
            ) {
                affected_rows
            }
        }
    `;

    await apolloClient.mutate({
        mutation: EventVonageSession_RemoveInvalidStreamsDocument,
        variables: {
            validStreamIds,
            eventId,
        },
    });
}

interface VonageLayout {
    vonageSessionLayoutId: string;
    streamClasses: {
        [streamId: string]: string[];
    };
    css: string;
}

export async function applyVonageBroadcastLayout(vonageSessionId: string, layout: VonageLayout): Promise<void> {
    try {
        const streams = await Vonage.listStreams(vonageSessionId);
        if (!streams) {
            console.error("Could not retrieve list of streams from Vonage", { vonageSessionId });
            throw new Error("Could not retrieve list of streams from Vonage");
        }

        const invalidStreamClasses = Object.keys(layout.streamClasses).filter(
            (streamId) => !streams.some((s) => s.id === streamId)
        );

        if (invalidStreamClasses.length) {
            console.error("Cannot apply Vonage layout, found invalid streams", {
                vonageSessionId,
                invalidStreams: Object.entries(layout.streamClasses).filter(([streamId]) =>
                    invalidStreamClasses.some((s) => s === streamId)
                ),
            });
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
    } catch (err) {
        const startedBroadcastIds = await getStartedBroadcastIds(vonageSessionId);

        console.log("Setting layout of Vonage broadcasts", { vonageSessionId, startedBroadcastIds });
        for (const startedBroadcastId of startedBroadcastIds) {
            try {
                await Vonage.setBroadcastLayout(startedBroadcastId, "custom", layout.css, null);
            } catch (err) {
                console.error("Failed to set layout for Vonage broadcast", {
                    eventVonageSessionLayoutId: layout.vonageSessionLayoutId,
                    startedBroadcastId,
                    err,
                });
            }
        }

        return;
    }
}

export async function handleEventVonageSessionLayoutCreated(
    payload: Payload<EventVonageSessionLayoutData>
): Promise<void> {
    assert(payload.event.data.new, "Expected payload to have new row");

    const newRow = payload.event.data.new;
    const layoutData = newRow.layoutData;

    if (!layoutData) {
        return;
    }

    // At the moment, there seems to be no easy way to figure out who is publishing a stream if we didn't
    // record/receive the callback. So we'll just settle for removing invalid ones.
    const { validStreamIds, eventId, vonageSessionId } = await getDetailsFromEventVonageSession(
        newRow.eventVonageSessionId
    );
    await removeInvalidEventParticipantStreams(validStreamIds, eventId);

    switch (layoutData.type) {
        case VonageSessionLayoutType.BestFit: {
            try {
                const streams = await Vonage.listStreams(vonageSessionId);

                if (!streams) {
                    throw new Error("Could not retrieve list of stream IDs from Vonage");
                }

                await Vonage.setStreamClassLists(
                    newRow.eventVonageSessionId,
                    streams.map((stream) => ({
                        id: stream.id,
                        layoutClassList: [],
                    }))
                );
            } catch (err) {
                console.error("Failed to unset stream class IDs. Continuing anyway.", {
                    eventVonageSessionLayoutId: newRow.id,
                    err,
                });
            }

            const startedBroadcastIds = await getStartedBroadcastIds(vonageSessionId);

            console.log("Setting broadcast layout to bestFit", { eventVonageSessionId: newRow.eventVonageSessionId });
            for (const startedBroadcastId of startedBroadcastIds) {
                try {
                    await Vonage.setBroadcastLayout(startedBroadcastId, "bestFit", null, "verticalPresentation");
                    await Vonage.signal(vonageSessionId, null, {
                        data: layoutData,
                        type: "layout-signal",
                    });
                } catch (err) {
                    console.error("Failed to apply Vonage layout", {
                        eventVonageSessionLayoutId: newRow.id,
                        startedBroadcastId,
                        err,
                    });
                }
            }
            return;
        }
        case VonageSessionLayoutType.Pair: {
            const layout = {
                css: "stream.left {display: block; position: absolute; width: 50%; height: 100%; left: 0;} stream.right {position: absolute; width: 50%; height: 100%; right: 0;}",
                streamClasses: {
                    left: [layoutData.leftStreamId],
                    right: [layoutData.rightStreamId],
                },
                vonageSessionLayoutId: newRow.id,
            };
            try {
                await applyVonageBroadcastLayout(vonageSessionId, layout);
                await Vonage.signal(vonageSessionId, null, {
                    data: layoutData,
                    type: "layout-signal",
                });
            } catch (err) {
                console.error("Failed to apply Vonage layout", {
                    err,
                    vonageSessionId,
                    vonageSessionLayoutId: newRow.id,
                    type: layoutData.type,
                });
            }

            return;
        }
        case VonageSessionLayoutType.Single: {
            const layout = {
                css: "stream.focus {display: block; position: absolute; width: 100%; height: 100%; left: 0;}",
                streamClasses: {
                    focus: [layoutData.focusStreamId],
                },
                vonageSessionLayoutId: newRow.id,
            };
            try {
                await applyVonageBroadcastLayout(vonageSessionId, layout);
                await Vonage.signal(vonageSessionId, null, {
                    data: layoutData,
                    type: "layout-signal",
                });
            } catch (err) {
                console.error("Failed to apply Vonage layout", {
                    err,
                    vonageSessionId,
                    vonageSessionLayoutId: newRow.id,
                    type: layoutData.type,
                });
            }

            return;
        }
        case VonageSessionLayoutType.PictureInPicture: {
            const layout = {
                css: "stream.focus {display: block; position: absolute; width: 100%; height: 100%; left: 0; z-index: 100;} stream.corner {display: block; position: absolute; width: 15%; height: 15%; right: 2%; bottom: 3%; z-index: 200;}",
                streamClasses: {
                    focus: [layoutData.focusStreamId],
                    corner: [layoutData.cornerStreamId],
                },
                vonageSessionLayoutId: newRow.id,
            };
            try {
                await applyVonageBroadcastLayout(vonageSessionId, layout);
                await Vonage.signal(vonageSessionId, null, {
                    data: layoutData,
                    type: "layout-signal",
                });
            } catch (err) {
                console.error("Failed to apply Vonage layout", {
                    err,
                    vonageSessionId,
                    vonageSessionLayoutId: newRow.id,
                    type: layoutData.type,
                });
            }

            return;
        }
    }
}

async function getStartedBroadcastIds(vonageSessionId: string): Promise<string[]> {
    const broadcasts = await Vonage.listBroadcasts({
        sessionId: vonageSessionId,
    });

    return broadcasts?.filter((broadcast) => broadcast.status === "started").map((broadcast) => broadcast.id) ?? [];
}
