import { gql } from "@apollo/client/core";
import assert from "assert";
import {
    EventVonageSessionLayout_GetSessionIdFromEventIdDocument,
    EventVonageSession_RemoveInvalidStreamsDocument,
} from "../generated/graphql";
import { apolloClient } from "../graphqlClient";
import Vonage from "../lib/vonage/vonageClient";
import { applyVonageBroadcastLayout, convertLayout } from "../lib/vonage/vonageTools";
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
    const layout = convertLayout(layoutData);
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
}
