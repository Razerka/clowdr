import { Box, Spinner, Text } from "@chakra-ui/react";
import React, { useMemo } from "react";
import { RoomEventDetailsFragment, useGetEventParticipantStreamsSubscription } from "../../../../../generated/graphql";
import { BroadcastControlPanel } from "./BroadcastControlPanel";
import { ImmediateSwitch } from "./ImmediateSwitch";

export function ChairControls({
    event,
    live,
    secondsUntilOffAir,
}: {
    event: RoomEventDetailsFragment;
    live: boolean;
    secondsUntilOffAir: number;
}): JSX.Element {
    const {
        data: streamsData,
        loading: streamsLoading,
        error: streamsError,
    } = useGetEventParticipantStreamsSubscription({
        variables: {
            eventId: event.id,
        },
    });

    const streamLayoutControls = useMemo(
        () => (
            <Box zIndex="500" position="relative">
                <Text fontSize="sm" mb={2}>
                    Here you can control how the video streams from the backstage are laid out in the broadcast video.
                </Text>
                {streamsError ? <>Error loading streams.</> : streamsLoading ? <Spinner /> : undefined}
                <BroadcastControlPanel
                    live={live}
                    streams={streamsData?.video_EventParticipantStream ?? null}
                    eventVonageSessionId={event.eventVonageSession?.id ?? null}
                />
            </Box>
        ),
        [event.eventVonageSession?.id, live, streamsData?.video_EventParticipantStream, streamsError, streamsLoading]
    );

    const immediateSwitchControls = useMemo(
        () => (
            <Box maxW="30ch">
                <ImmediateSwitch live={live} secondsUntilOffAir={secondsUntilOffAir} eventId={event.id} />
            </Box>
        ),
        [event.id, live, secondsUntilOffAir]
    );
    return (
        <>
            {streamLayoutControls}
            {immediateSwitchControls}
        </>
    );
}
