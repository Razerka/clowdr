import { gql } from "@apollo/client";
import {
    Button,
    Grid,
    GridItem,
    Popover,
    PopoverArrow,
    PopoverBody,
    PopoverCloseButton,
    PopoverContent,
    PopoverHeader,
    PopoverTrigger,
    Text,
    useColorModeValue,
    useTheme,
} from "@chakra-ui/react";
import { transparentize } from "@chakra-ui/theme-tools";
import React, { useEffect, useMemo, useState } from "react";
import type { RoomEventDetailsFragment } from "../../../../../generated/graphql";
import { FAIcon } from "../../../../Icons/FAIcon";
import { useVonageGlobalState } from "../Vonage/VonageGlobalStateProvider";
import { ChairControls } from "./ChairControls";
import { LiveIndicator } from "./LiveIndicator";

export function MenuBar({ event }: { event: RoomEventDetailsFragment }): JSX.Element {
    gql`
        subscription GetEventParticipantStreams($eventId: uuid!) {
            video_EventParticipantStream(where: { eventId: { _eq: $eventId } }) {
                ...EventParticipantStreamDetails
            }
        }

        fragment EventParticipantStreamDetails on video_EventParticipantStream {
            id
            registrant {
                id
                displayName
            }
            conferenceId
            eventId
            vonageStreamType
            vonageStreamId
            registrantId
        }
    `;

    const vonageGlobalState = useVonageGlobalState();
    const [isConnected, setIsConnected] = useState<boolean>(false);
    useEffect(() => {
        const unobserve = vonageGlobalState.IsConnected.subscribe((isConn) => {
            setIsConnected(isConn);
        });
        return () => {
            unobserve();
        };
    }, [vonageGlobalState]);

    const theme = useTheme();
    const chairControls = useMemo(
        () => (
            <Popover isLazy={true}>
                <PopoverTrigger>
                    <Button
                        aria-label="Chair/presenter controls"
                        title="Chair/presenter controls"
                        textAlign="center"
                        colorScheme="gray"
                        bgColor={transparentize("gray.200", 0.7)(theme)}
                        size="sm"
                        rightIcon={<FAIcon icon="chevron-circle-down" iconStyle="s" mr={2} />}
                    >
                        <Text>More</Text>
                    </Button>
                </PopoverTrigger>
                <PopoverContent zIndex="100">
                    <PopoverArrow />
                    <PopoverCloseButton />
                    <PopoverHeader>Chair controls</PopoverHeader>
                    <PopoverBody>
                        <ChairControls event={event} /*secondsUntilOffAir={secondsUntilOffAir}*/ />
                    </PopoverBody>
                </PopoverContent>
            </Popover>
        ),
        [event, theme]
    );
    const bgColor = useColorModeValue("gray.100", "gray.800");

    return (
        <Grid templateColumns="1fr auto 1fr" columnGap={4} p={2} boxShadow="md" rounded="md" bgColor={bgColor}>
            <GridItem />
            <GridItem>
                <LiveIndicator event={event} isConnected={isConnected} />
            </GridItem>
            <GridItem display="flex" justifyContent="flex-end" flexDirection="row" alignItems="center">
                {isConnected ? chairControls : undefined}
            </GridItem>
        </Grid>
    );
}
