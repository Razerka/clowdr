import {
    Box,
    Button,
    Flex,
    Link,
    Modal,
    ModalBody,
    ModalCloseButton,
    ModalContent,
    ModalHeader,
    ModalOverlay,
    Text,
    useColorModeValue,
    useDisclosure,
    VStack,
} from "@chakra-ui/react";
import { ElementBaseType, ElementDataBlob } from "@clowdr-app/shared-types/build/content";
import { DateTime } from "luxon";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Twemoji } from "react-emoji-render";
import { Link as ReactLink } from "react-router-dom";
import {
    Content_ElementType_Enum,
    Schedule_EventSummaryFragment,
    Schedule_ItemFragment,
    useSchedule_SelectItemLazyQuery,
} from "../../../../generated/graphql";
import { LinkButton } from "../../../Chakra/LinkButton";
import FAIcon from "../../../Icons/FAIcon";
import { Markdown } from "../../../Text/Markdown";
import { useConference } from "../../useConference";
import { AuthorList } from "../Content/AuthorList";
import type { TimelineEvent } from "./DayList";
import useTimelineParameters from "./useTimelineParameters";

function EventBoxPopover({
    eventStartMs,
    durationSeconds,
    roomName,
    events,
    content,
    isOpen,
    onClose,
}: {
    eventStartMs: number;
    durationSeconds: number;
    roomName: string;
    events: ReadonlyArray<Schedule_EventSummaryFragment>;
    content: Schedule_ItemFragment | null | undefined;
    isOpen: boolean;
    onClose: () => void;
}): JSX.Element {
    const conference = useConference();
    const event0 = events[0];
    const eventTitle = content ? (events.length > 1 ? content.title : `${content.title}`) : event0.name;

    const now = Date.now();
    const isLive = eventStartMs < now + 10 * 60 * 1000 && now < eventStartMs + durationSeconds * 1000;

    const abstractData: ElementDataBlob | undefined = content?.abstractElements?.find(
        (x) => x.typeName === Content_ElementType_Enum.Abstract
    )?.data;
    let abstractText: string | undefined;
    if (abstractData) {
        const innerAbstractData = abstractData[abstractData.length - 1];
        if (innerAbstractData.data.baseType === ElementBaseType.Text) {
            abstractText = innerAbstractData.data.text;
        }
    }
    const roomUrl = `/conference/${conference.slug}/room/${event0.roomId}`;
    const itemUrl = content ? `/conference/${conference.slug}/item/${content.id}` : roomUrl;

    const ref = useRef<HTMLAnchorElement>(null);
    useEffect(() => {
        let tId: number | undefined;
        if (isOpen) {
            tId = setTimeout(
                (() => {
                    ref.current?.focus();
                }) as TimerHandler,
                50
            );
        }
        return () => {
            if (tId) {
                clearTimeout(tId);
            }
        };
    }, [isOpen]);

    const timelineParams = useTimelineParameters();

    return (
        <Modal
            closeOnEsc={true}
            isOpen={isOpen}
            onClose={onClose}
            returnFocusOnClose={false}
            autoFocus={true}
            scrollBehavior="inside"
            size="4xl"
        >
            <ModalOverlay />
            <ModalContent pb={4}>
                <ModalCloseButton />
                <ModalHeader fontWeight="semibold" pr={1}>
                    <Text
                        aria-label={`Starts at ${DateTime.fromISO(event0.startTime)
                            .setZone(timelineParams.timezone)
                            .toLocaleString({
                                weekday: "long",
                                hour: "numeric",
                                minute: "numeric",
                            })} and lasts ${Math.round(durationSeconds / 60)} minutes.`}
                        mb={2}
                        fontSize="sm"
                        fontStyle="italic"
                    >
                        {DateTime.fromMillis(eventStartMs).setZone(timelineParams.timezone).toLocaleString({
                            weekday: "short",
                            month: "short",
                            day: "2-digit",
                            hour: "numeric",
                            minute: "numeric",
                            hour12: false,
                        })}{" "}
                        -{" "}
                        {DateTime.fromMillis(eventStartMs + durationSeconds * 1000)
                            .setZone(timelineParams.timezone)
                            .toLocaleString({
                                hour: "numeric",
                                minute: "numeric",
                                hour12: false,
                            })}
                    </Text>
                    <Flex direction="row">
                        {content ? (
                            <Text>
                                <Link ref={ref} as={ReactLink} to={itemUrl} textDecoration="none">
                                    <Twemoji className="twemoji" text={eventTitle} />
                                </Link>
                            </Text>
                        ) : undefined}
                        <Flex direction="row" justifyContent="flex-end" alignItems="start" ml="auto">
                            {itemUrl ? (
                                <LinkButton
                                    ml={1}
                                    mr={1}
                                    size="xs"
                                    colorScheme="green"
                                    to={itemUrl}
                                    title={content ? "View item" : `Go to room ${roomName}`}
                                    textDecoration="none"
                                >
                                    <FAIcon iconStyle="s" icon="link" />
                                    <Text as="span" ml={1}>
                                        {content ? "View" : "Room"}
                                    </Text>
                                </LinkButton>
                            ) : undefined}
                            {isLive ? (
                                <LinkButton
                                    ml={1}
                                    mr={1}
                                    size="xs"
                                    colorScheme={"red"}
                                    to={roomUrl}
                                    title={`Event is happening now. Go to room ${roomName}`}
                                    textDecoration="none"
                                >
                                    <FAIcon iconStyle="s" icon="link" mr={2} />
                                    <Text as="span" ml={1}>
                                        LIVE View
                                    </Text>
                                </LinkButton>
                            ) : undefined}
                        </Flex>
                    </Flex>
                </ModalHeader>
                <ModalBody as={VStack} spacing={4} justifyContent="flex-start" alignItems="start">
                    <Box>
                        <Markdown>{abstractText}</Markdown>
                    </Box>
                    {content?.itemPeople.length ? <AuthorList programPeopleData={content.itemPeople} /> : undefined}
                </ModalBody>
            </ModalContent>
        </Modal>
    );
}

export default function EventBox({
    sortedEvents,
    roomName,
    scrollToEventCbs,
}: {
    sortedEvents: ReadonlyArray<TimelineEvent>;
    roomName: string;
    scrollToEventCbs: Map<string, () => void>;
}): JSX.Element | null {
    const event = sortedEvents[0];
    const eventStartMs = useMemo(() => Date.parse(event.startTime), [event.startTime]);
    const durationSeconds = useMemo(() => {
        const lastEvent = sortedEvents[sortedEvents.length - 1];
        return (Date.parse(lastEvent.startTime) + lastEvent.durationSeconds * 1000 - eventStartMs) / 1000;
    }, [eventStartMs, sortedEvents]);

    const timelineParams = useTimelineParameters();

    const offsetMs = eventStartMs - timelineParams.earliestMs;
    const offsetSeconds = offsetMs / 1000;
    const topPc = (100 * offsetSeconds) / timelineParams.fullTimeSpanSeconds;
    const heightPc = (100 * durationSeconds) / timelineParams.fullTimeSpanSeconds;

    const eventTitle = event.item ? (sortedEvents.length > 1 ? event.item.title : `${event.item.title}`) : event.name;
    const buttonContents = useMemo(() => {
        return (
            <Box overflow="hidden" w="100%" textOverflow="ellipsis" maxH="100%" whiteSpace="normal">
                <Twemoji className="twemoji" text={eventTitle} />
            </Box>
        );
    }, [eventTitle]);

    const eventFocusRef = React.useRef<HTMLButtonElement>(null);
    const { isOpen, onClose, onOpen } = useDisclosure();

    const scrollToEvent = useCallback(() => {
        eventFocusRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
            inline: "center",
        });
    }, []);

    useEffect(() => {
        scrollToEventCbs.set(event.id, scrollToEvent);
    }, [event.id, scrollToEvent, scrollToEventCbs]);

    const [getContent, content] = useSchedule_SelectItemLazyQuery();
    useEffect(() => {
        if (isOpen && !content.data && event.itemId) {
            getContent({
                variables: {
                    id: event.itemId,
                },
            });
        }
    }, [content.data, getContent, isOpen, event.itemId]);

    const borderColour = useColorModeValue("blue.200", "blue.800");
    return (
        <>
            <Button
                ref={eventFocusRef}
                zIndex={1}
                cursor="pointer"
                position="absolute"
                top={topPc + "%"}
                height={heightPc + "%"}
                width="100%"
                left={0}
                borderColor={borderColour}
                borderWidth={1}
                borderRadius={0}
                borderStyle="solid"
                p={2}
                boxSizing="border-box"
                fontSize="sm"
                lineHeight="120%"
                textAlign="left"
                onClick={onOpen}
                onKeyDown={(ev) => {
                    if (ev.key === "Enter") {
                        onOpen();
                    }
                }}
                disabled={isOpen}
                tabIndex={0}
                overflow="hidden"
                minW={0}
                colorScheme="blue"
                role="button"
                aria-label={`${eventTitle} starts ${DateTime.fromMillis(eventStartMs)
                    .setZone(timelineParams.timezone)
                    .toLocaleString({
                        weekday: "long",
                        hour: "numeric",
                        minute: "numeric",
                    })} and lasts ${Math.round(durationSeconds / 60)} minutes.`}
                justifyContent="flex-start"
                alignItems="flex-start"
            >
                {buttonContents}
            </Button>
            {isOpen ? (
                <EventBoxPopover
                    eventStartMs={eventStartMs}
                    durationSeconds={durationSeconds}
                    roomName={roomName}
                    events={sortedEvents}
                    content={content.data?.content_Item_by_pk}
                    isOpen={isOpen}
                    onClose={onClose}
                />
            ) : undefined}
        </>
    );
}
