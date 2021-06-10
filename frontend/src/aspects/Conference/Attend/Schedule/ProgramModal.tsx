import { gql } from "@apollo/client";
import {
    Modal,
    ModalBody,
    ModalCloseButton,
    ModalContent,
    ModalOverlay,
    ModalProps,
    Tab,
    TabList,
    TabPanel,
    TabPanels,
    Tabs,
} from "@chakra-ui/react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    Schedule_EventSummaryFragment,
    Schedule_HappeningSoonQuery,
    Schedule_ItemElementsFragment,
    Schedule_RoomSummaryFragment,
    Schedule_TagFragment,
    useGetSponsorBoothsQuery,
    useSchedule_HappeningSoonQuery,
} from "../../../../generated/graphql";
import { roundDownToNearest, roundUpToNearest } from "../../../Generic/MathUtils";
import { useRealTime } from "../../../Generic/useRealTime";
import ApolloQueryWrapper from "../../../GQL/ApolloQueryWrapper";
import { FAIcon } from "../../../Icons/FAIcon";
import { useConference } from "../../useConference";
import ItemList from "../Content/ItemList";
import { ExhibitionsGrid } from "../Exhibition/ExhibitionsPage";
import { SponsorBoothsInner } from "../Rooms/V2/SponsorBooths";
import SearchPanel from "../Search/SearchPanel";
import { ScheduleFetchWrapper, ScheduleInner } from "./Schedule";

gql`
    query Schedule_HappeningSoon($conferenceId: uuid!, $startBefore: timestamptz!, $endAfter: timestamptz!) {
        room_Room(
            where: {
                conferenceId: { _eq: $conferenceId }
                managementModeName: { _in: [PUBLIC, PRIVATE] }
                events: { startTime: { _lte: $startBefore }, endTime: { _gte: $endAfter } }
            }
        ) {
            ...Schedule_RoomSummary
        }
        schedule_Event(
            where: {
                conferenceId: { _eq: $conferenceId }
                startTime: { _lte: $startBefore }
                endTime: { _gte: $endAfter }
            }
        ) {
            ...Schedule_EventSummary
            item {
                ...Schedule_ItemElements
            }
        }
        collection_Tag(where: { conferenceId: { _eq: $conferenceId } }) {
            ...Schedule_Tag
        }
    }
`;

export function ScheduleModal(props: Omit<ModalProps, "children">): JSX.Element {
    const conference = useConference();
    const closeRef = useRef<HTMLButtonElement | null>(null);

    const [anyHappeningSoon, setAnyHappeningSoon] = useState<boolean>(false);
    const now = useRealTime(15 * 60 * 1000);
    const endAfter = useMemo(() => new Date(roundDownToNearest(now - 10 * 60 * 1000, 5 * 60 * 1000)).toISOString(), [
        now,
    ]);
    const startBefore = useMemo(
        () => new Date(roundUpToNearest(now + 2 * 60 * 60 * 1000, 15 * 60 * 1000)).toISOString(),
        [now]
    );
    const roomsResult = useSchedule_HappeningSoonQuery({
        variables: {
            conferenceId: conference.id,
            endAfter,
            startBefore,
        },
    });
    useEffect(() => {
        setAnyHappeningSoon(!!roomsResult.data && roomsResult.data.schedule_Event.length > 0);
    }, [setAnyHappeningSoon, roomsResult.data]);
    const happeningSoon = useMemo(
        () => (
            <ApolloQueryWrapper<
                Schedule_HappeningSoonQuery,
                unknown,
                {
                    rooms: ReadonlyArray<Schedule_RoomSummaryFragment>;
                    events: ReadonlyArray<Schedule_EventSummaryFragment>;
                    items: ReadonlyArray<Schedule_ItemElementsFragment>;
                    tags: ReadonlyArray<Schedule_TagFragment>;
                }
            >
                queryResult={roomsResult}
                getter={(x) => ({
                    rooms: x.room_Room,
                    events: x.schedule_Event,
                    items: x.schedule_Event
                        .filter((x) => !!x.item)
                        .map((x) => x.item) as Schedule_ItemElementsFragment[],
                    tags: x.collection_Tag,
                })}
            >
                {(data) => <ScheduleInner titleStr={"Happening Soon"} {...data} />}
            </ApolloQueryWrapper>
        ),
        [roomsResult]
    );

    const [anySponsors, setAnySponsors] = useState<boolean>(false);
    const result = useGetSponsorBoothsQuery({
        variables: {
            conferenceId: conference.id,
        },
        fetchPolicy: "cache-and-network",
        nextFetchPolicy: "cache-first",
    });
    useEffect(() => {
        setAnySponsors?.(!!result.data && result.data.content_Item.length > 0);
    }, [setAnySponsors, result.data]);
    const sponsors = useMemo(() => <SponsorBoothsInner sponsors={result.data?.content_Item ?? []} />, [
        result.data?.content_Item,
    ]);

    return (
        <Modal
            initialFocusRef={closeRef}
            size="6xl"
            isCentered
            autoFocus={false}
            returnFocusOnClose={false}
            trapFocus={true}
            scrollBehavior="inside"
            {...props}
        >
            <ModalOverlay />
            <ModalContent minH="70vh" overflow="hidden">
                <ModalCloseButton ref={closeRef} />
                <ModalBody display="flex" justifyContent="center" overflow="hidden">
                    <Tabs isLazy w="100%" display="flex" flexDir="column">
                        <TabList justifyContent="center">
                            {anyHappeningSoon ? (
                                <Tab>
                                    <FAIcon iconStyle="s" icon="clock" />
                                    &nbsp;&nbsp;Happening soon
                                </Tab>
                            ) : undefined}
                            <Tab>
                                <FAIcon iconStyle="s" icon="tags" />
                                &nbsp;&nbsp;Browse content
                            </Tab>
                            <Tab>
                                <FAIcon iconStyle="s" icon="puzzle-piece" />
                                &nbsp;&nbsp;Exhibitions
                            </Tab>
                            {anySponsors ? (
                                <Tab>
                                    <FAIcon iconStyle="s" icon="star" />
                                    &nbsp;&nbsp;Sponsors
                                </Tab>
                            ) : undefined}
                            <Tab>
                                <FAIcon iconStyle="s" icon="search" />
                                &nbsp;&nbsp;Search program
                            </Tab>
                            <Tab>
                                <FAIcon iconStyle="s" icon="calendar" />
                                &nbsp;&nbsp;Full schedule
                            </Tab>
                        </TabList>
                        <TabPanels h="100%" overflow="hidden">
                            {anyHappeningSoon ? (
                                <TabPanel w="100%" h="100%" display="flex" justifyContent="center">
                                    {happeningSoon}
                                </TabPanel>
                            ) : undefined}
                            <TabPanel w="100%" h="100%" display="flex" justifyContent="center" overflowY="auto">
                                <ItemList />
                            </TabPanel>
                            <TabPanel w="100%" h="100%" overflowY="auto">
                                <ExhibitionsGrid />
                            </TabPanel>
                            {anySponsors ? <TabPanel>{sponsors}</TabPanel> : undefined}
                            <TabPanel w="100%" h="100%" overflowY="auto">
                                <SearchPanel />
                            </TabPanel>
                            <TabPanel w="100%" h="100%" display="flex" justifyContent="center">
                                <ScheduleFetchWrapper />
                            </TabPanel>
                        </TabPanels>
                    </Tabs>
                </ModalBody>
            </ModalContent>
        </Modal>
    );
}
