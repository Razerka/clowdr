import { Box, Spinner, Text } from "@chakra-ui/react";
import React, { useMemo } from "react";
import { useDeepCompareMemo } from "use-deep-compare";
import { RoomEventDetailsFragment, useGetEventParticipantStreamsSubscription } from "../../../../../generated/graphql";
import { BroadcastControlPanel } from "./BroadcastControlPanel";

export function ChairControls({
    event,
}: // secondsUntilOffAir,
{
    event: RoomEventDetailsFragment;
    // secondsUntilOffAir: number;
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

    const streamsDataMemo = useDeepCompareMemo(() => streamsData, [streamsData]);

    const streamLayoutControls = useMemo(
        () => (
            <Box zIndex="500" position="relative">
                <Text fontSize="sm" mb={2}>
                    Control how the video streams from the backstage are laid out in the broadcast video.
                </Text>
                {streamsError ? <>Error loading streams.</> : streamsLoading ? <Spinner /> : undefined}
                <BroadcastControlPanel
                    streams={streamsDataMemo?.video_EventParticipantStream ?? null}
                    eventVonageSessionId={event.eventVonageSession?.id ?? null}
                />
            </Box>
        ),
        [event.eventVonageSession?.id, streamsDataMemo?.video_EventParticipantStream, streamsError, streamsLoading]
    );

    // const immediateSwitchControls = useMemo(
    //     () => (
    //         <Box>
    //             <Text fontSize="sm" mb={2}>
    //                 Here you can control what video source is being played to the audience.
    //             </Text>
    //             <ImmediateSwitch live={live} secondsUntilOffAir={secondsUntilOffAir} eventId={event.id} />
    //         </Box>
    //     ),
    //     [event.id, live, secondsUntilOffAir]
    // );
    return (
        <>
            {streamLayoutControls}
            {/* {immediateSwitchControls} */}
        </>
    );
}
