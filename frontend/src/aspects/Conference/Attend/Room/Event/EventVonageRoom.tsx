import { gql } from "@apollo/client";
import { Box, VStack } from "@chakra-ui/react";
import React, { useCallback } from "react";
import * as portals from "react-reverse-portal";
import {
    RoomEventDetailsFragment,
    useGetEventDetailsQuery,
    useGetEventVonageTokenMutation,
} from "../../../../../generated/graphql";
import ApolloQueryWrapper from "../../../../GQL/ApolloQueryWrapper";
import { useSharedRoomContext } from "../../../../Room/useSharedRoomContext";
import { useVonageLayout, VonageLayoutProvider } from "../Vonage/VonageLayoutProvider";
import { MenuBar } from "./MenuBar";

gql`
    mutation GetEventVonageToken($eventId: uuid!) {
        joinEventVonageSession(eventId: $eventId) {
            accessToken
        }
    }

    query GetEventDetails($eventId: uuid!) {
        schedule_Event_by_pk(id: $eventId) {
            ...RoomEventDetails
        }
    }

    fragment RoomEventDetails on schedule_Event {
        id
        conferenceId
        startTime
        name
        durationSeconds
        endTime
        intendedRoomModeName
        eventVonageSession {
            id
            sessionId
        }
    }
`;

export function EventVonageRoom({
    eventId,
    isRaiseHandPreJoin = false,
    isRaiseHandWaiting,
    completeJoinRef,
    onLeave,
}: {
    eventId: string;
    isRaiseHandPreJoin?: boolean;
    isRaiseHandWaiting?: boolean;
    completeJoinRef?: React.MutableRefObject<() => Promise<void>>;
    onLeave?: () => void;
}): JSX.Element {
    const result = useGetEventDetailsQuery({
        variables: {
            eventId,
        },
        fetchPolicy: "network-only",
    });

    return (
        <VonageLayoutProvider eventId={eventId}>
            <ApolloQueryWrapper queryResult={result} getter={(data) => data.schedule_Event_by_pk}>
                {(event: RoomEventDetailsFragment) => (
                    <EventVonageRoomInner
                        event={event}
                        isRaiseHandPreJoin={isRaiseHandPreJoin}
                        isRaiseHandWaiting={isRaiseHandWaiting}
                        completeJoinRef={completeJoinRef}
                        onLeave={onLeave}
                    />
                )}
            </ApolloQueryWrapper>
        </VonageLayoutProvider>
    );
}

export function EventVonageRoomInner({
    event,
    isRaiseHandPreJoin = false,
    isRaiseHandWaiting,
    completeJoinRef,
    onLeave,
}: {
    event: RoomEventDetailsFragment;
    isRaiseHandPreJoin?: boolean;
    isRaiseHandWaiting?: boolean;
    completeJoinRef?: React.MutableRefObject<() => Promise<void>>;
    onLeave?: () => void;
}): JSX.Element {
    const [getEventVonageToken] = useGetEventVonageTokenMutation({
        variables: {
            eventId: event.id,
        },
    });

    const getAccessToken = useCallback(async () => {
        const result = await getEventVonageToken();
        if (!result.data?.joinEventVonageSession?.accessToken) {
            throw new Error("No Vonage session ID");
        }
        return result.data?.joinEventVonageSession.accessToken;
    }, [getEventVonageToken]);

    const sharedRoomContext = useSharedRoomContext();
    const layout = useVonageLayout();

    return (
        <VStack alignItems="stretch" w="100%" isolation="isolate">
            <Box zIndex={2} pos="sticky" top={0}>
                {!isRaiseHandPreJoin ? <MenuBar event={event} /> : undefined}
            </Box>
            <Box w="100%" zIndex={1}>
                {event.eventVonageSession && sharedRoomContext ? (
                    <portals.OutPortal
                        node={sharedRoomContext.vonagePortalNode}
                        eventId={event.id}
                        vonageSessionId={event.eventVonageSession.sessionId}
                        getAccessToken={getAccessToken}
                        disable={false}
                        isBackstageRoom={true}
                        raiseHandPrejoinEventId={isRaiseHandPreJoin ? event.id : null}
                        isRaiseHandWaiting={isRaiseHandWaiting}
                        requireMicrophone={isRaiseHandPreJoin}
                        completeJoinRef={completeJoinRef}
                        onLeave={onLeave}
                        layout={layout}
                    />
                ) : (
                    <>No room session available.</>
                )}
            </Box>
        </VStack>
    );
}
