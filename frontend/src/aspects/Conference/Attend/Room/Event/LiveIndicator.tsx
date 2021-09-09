import { gql } from "@apollo/client";
import {
    Badge,
    Button,
    HStack,
    Modal,
    ModalBody,
    ModalCloseButton,
    ModalContent,
    ModalFooter,
    ModalHeader,
    ModalOverlay,
    Stat,
    StatLabel,
    StatNumber,
    Text,
    useDisclosure,
    VStack,
} from "@chakra-ui/react";
import { Content_ElementType_Enum, ElementDataBlob, isElementDataBlob } from "@clowdr-app/shared-types/build/content";
import { ImmediateSwitchData } from "@clowdr-app/shared-types/build/video/immediateSwitchData";
import { plainToClass } from "class-transformer";
import { validateSync } from "class-validator";
import * as R from "ramda";
import React, { useMemo } from "react";
import { useLiveIndicator_GetElementQuery, useLiveIndicator_GetLatestQuery } from "../../../../../generated/graphql";
import { FAIcon } from "../../../../Icons/FAIcon";
import { formatRemainingTime } from "../formatRemainingTime";

export function LiveIndicator({
    live,
    now,
    secondsUntilLive,
    secondsUntilOffAir,
    eventId,
    isConnected,
}: {
    live: boolean;
    now: number;
    secondsUntilLive: number;
    secondsUntilOffAir: number;
    eventId: string;
    isConnected: boolean;
}): JSX.Element {
    const { isOpen, onOpen, onClose } = useDisclosure();
    const shouldModalBeOpen = isOpen && secondsUntilLive > 10;

    gql`
        query LiveIndicator_GetLatest($eventId: uuid!) {
            video_ImmediateSwitch(
                order_by: { executedAt: desc_nulls_last }
                where: { eventId: { _eq: $eventId }, executedAt: { _is_null: false } }
                limit: 1
            ) {
                id
                data
                executedAt
            }
        }

        query LiveIndicator_GetElement($elementId: uuid!) {
            content_Element_by_pk(id: $elementId) {
                id
                data
            }
        }
    `;

    const { data: latestImmediateSwitchData } = useLiveIndicator_GetLatestQuery({
        variables: {
            eventId,
        },
        pollInterval: 10000,
    });

    const latestSwitchData = useMemo(() => {
        if (!latestImmediateSwitchData?.video_ImmediateSwitch?.length) {
            return null;
        }

        const transformed = plainToClass(ImmediateSwitchData, {
            type: "switch",
            data: latestImmediateSwitchData.video_ImmediateSwitch[0].data,
        });

        const errors = validateSync(transformed);
        if (errors.length) {
            console.error("Invalid immediate switch", { errors, data: transformed });
            return null;
        }

        return transformed;
    }, [latestImmediateSwitchData]);

    const { data: currentElementData } = useLiveIndicator_GetElementQuery({
        variables: {
            elementId: latestSwitchData?.data.kind === "video" ? latestSwitchData.data.elementId : null,
        },
        skip: latestSwitchData?.data.kind !== "video",
    });

    const durationCurrentElement = useMemo((): number | null => {
        if (
            currentElementData?.content_Element_by_pk?.data &&
            isElementDataBlob(currentElementData.content_Element_by_pk.data)
        ) {
            const elementDataBlob: ElementDataBlob = currentElementData.content_Element_by_pk.data;
            const latestVersion = R.last(elementDataBlob);
            if (
                !latestVersion ||
                latestVersion.data.type !== Content_ElementType_Enum.VideoBroadcast ||
                !latestVersion.data.broadcastTranscode?.durationSeconds
            ) {
                return null;
            }

            return latestVersion.data.broadcastTranscode.durationSeconds;
        }
        return null;
    }, [currentElementData?.content_Element_by_pk?.data]);

    const currentInput = useMemo((): "filler" | "rtmp_push" | "video" | "video_ending" | null => {
        if (!latestSwitchData) {
            return "rtmp_push";
        }

        switch (latestSwitchData.data.kind) {
            case "filler":
                return "filler";
            case "rtmp_push":
                return "rtmp_push";
            case "video": {
                if (!latestImmediateSwitchData?.video_ImmediateSwitch?.[0]?.executedAt) {
                    return null;
                }
                if (!durationCurrentElement) {
                    return "video";
                }
                const switchedToVideoAt = Date.parse(latestImmediateSwitchData?.video_ImmediateSwitch[0].executedAt);
                if (now - switchedToVideoAt > durationCurrentElement * 1000) {
                    return "rtmp_push";
                } else if (now - switchedToVideoAt > (durationCurrentElement - 10) * 1000) {
                    return "video_ending";
                } else {
                    return "video";
                }
            }
        }

        return null;
    }, [durationCurrentElement, latestImmediateSwitchData?.video_ImmediateSwitch, latestSwitchData, now]);

    const whatIsLiveText = useMemo(() => {
        switch (currentInput) {
            case null:
                return (
                    <>
                        <FAIcon icon="question-circle" iconStyle="s" fontSize="lg" />
                        <Text>Uncertain input</Text>
                    </>
                );
            case "filler":
                return (
                    <>
                        <FAIcon icon="play" iconStyle="s" fontSize="lg" />
                        <Text>Filler video</Text>
                    </>
                );
            case "rtmp_push":
                return (
                    <>
                        <FAIcon icon="broadcast-tower" iconStyle="s" fontSize="lg" />
                        <VStack>
                            <Text fontSize={!isConnected ? "xs" : undefined}>Backstage is live</Text>
                            {!isConnected ? <Text>You are not connected</Text> : undefined}
                        </VStack>
                    </>
                );
            case "video":
                return (
                    <>
                        <FAIcon icon="play" iconStyle="s" fontSize="lg" />
                        <Text>Pre-recorded video</Text>
                    </>
                );
            case "video_ending":
                return (
                    <>
                        <FAIcon icon="play" iconStyle="s" fontSize="lg" />
                        <Text>Pre-recorded video (ending soon)</Text>
                    </>
                );
        }
    }, [currentInput, isConnected]);

    return (
        <>
            <Modal isOpen={shouldModalBeOpen} onClose={onClose} isCentered>
                <ModalOverlay />
                <ModalContent>
                    <ModalHeader>
                        You will be live the moment the indicator says &ldquo;Backstage is live&rdquo;.
                    </ModalHeader>
                    <ModalCloseButton />
                    <ModalBody>
                        <VStack alignItems="left">
                            <Text>
                                <strong>The audience sees the stream with a bit of delay.</strong> This is normally 5-30
                                seconds depending on where they are in the world. Don&apos;t wait for the audience to
                                tell you they can see you - or they will see you sitting there silently for up to thirty
                                seconds!
                            </Text>
                            <Text>
                                <strong>Pay attention to the countdown clock.</strong> If it says the backstage is live,
                                then you are live in front of the entire conference and should start your presentation
                                or Q&amp;A session.
                            </Text>
                            <Text>
                                <strong>Open the chat sidebar now.</strong> It&apos;s a good idea to have the chat open
                                so that you can read feedback from the audience.
                            </Text>
                        </VStack>
                    </ModalBody>
                    <ModalFooter>
                        <Button colorScheme="blue" mr={3} onClick={onClose}>
                            Close
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
            {live ? (
                <HStack
                    alignItems="stretch"
                    justifyContent="flex-start"
                    mx="auto"
                    flexWrap="wrap"
                    top={0}
                    zIndex={10000}
                    overflow="visible"
                    gridRowGap={2}
                >
                    <Badge
                        fontSize={isConnected ? "lg" : "md"}
                        colorScheme="red"
                        fontWeight="bold"
                        p="1em"
                        display="flex"
                        flexGrow={1}
                        justifyContent="center"
                        alignItems="center"
                    >
                        <HStack>{whatIsLiveText}</HStack>
                    </Badge>
                    <Stat
                        fontSize="md"
                        ml="auto"
                        flexGrow={1}
                        textAlign="center"
                        display="flex"
                        flexDirection="column"
                        justifyContent="center"
                    >
                        <StatLabel>Time until end</StatLabel>
                        <StatNumber
                            css={{
                                "font-feature-settings": "tnum",
                                "font-variant-numeric": "tabular-nums",
                            }}
                        >
                            {formatRemainingTime(secondsUntilOffAir)}
                        </StatNumber>
                    </Stat>
                </HStack>
            ) : (
                <HStack
                    alignItems="stretch"
                    justifyContent="center"
                    mx="auto"
                    flexWrap="wrap"
                    top={0}
                    zIndex={10000}
                    overflow="visible"
                    gridRowGap={2}
                >
                    {secondsUntilLive > 0 ? (
                        <>
                            <Badge
                                fontSize="lg"
                                colorScheme="blue"
                                fontWeight="bold"
                                p={4}
                                backgroundColor={
                                    secondsUntilLive < 10 ? (secondsUntilLive % 2 >= 1 ? "red" : "black") : undefined
                                }
                                color={secondsUntilLive < 10 ? "white" : undefined}
                                display="flex"
                                justifyContent="center"
                                alignItems="center"
                                flexGrow={1}
                            >
                                <VStack>
                                    <Text fontSize={!isConnected ? "xs" : undefined}>Backstage is off-air</Text>
                                    {!isConnected ? <Text>You are not connected</Text> : undefined}
                                </VStack>
                            </Badge>
                            {secondsUntilLive < 1200 ? (
                                <Stat
                                    fontSize="md"
                                    ml="auto"
                                    flexGrow={1}
                                    textAlign="center"
                                    color={secondsUntilLive < 10 ? "white" : undefined}
                                    p={2}
                                    backgroundColor={
                                        secondsUntilLive < 10
                                            ? secondsUntilLive % 2 >= 1
                                                ? "red"
                                                : "black"
                                            : undefined
                                    }
                                    display="flex"
                                    flexDir="column"
                                    justifyContent="center"
                                >
                                    <StatLabel>Time until start</StatLabel>
                                    <StatNumber
                                        css={{
                                            "font-feature-settings": "tnum",
                                            "font-variant-numeric": "tabular-nums",
                                        }}
                                    >
                                        {formatRemainingTime(secondsUntilLive)}
                                    </StatNumber>
                                </Stat>
                            ) : (
                                <></>
                            )}
                            {secondsUntilLive > 10 ? (
                                <Button
                                    onClick={onOpen}
                                    h="auto"
                                    maxH="auto"
                                    p={3}
                                    colorScheme="blue"
                                    size="sm"
                                    whiteSpace="normal"
                                    wordWrap="break-word"
                                    flexShrink={1}
                                    maxW="15ch"
                                >
                                    How do I use the backstage?
                                </Button>
                            ) : undefined}
                        </>
                    ) : (
                        <Badge fontSize="lg" colorScheme="blue" fontWeight="bold" p={4}>
                            <Text>Backstage is off air</Text>
                        </Badge>
                    )}
                </HStack>
            )}
        </>
    );
}
