import { gql } from "@apollo/client";
import { Accordion, AccordionButton, AccordionItem, AccordionPanel, Button, Text, useToast } from "@chakra-ui/react";
import { VonageSessionLayoutData, VonageSessionLayoutType } from "@clowdr-app/shared-types/build/vonage";
import React, { useCallback, useMemo } from "react";
import {
    EventParticipantStreamDetailsFragment,
    useBroadcastControlPanel_InsertEventVonageSessionLayoutMutation,
} from "../../../../../generated/graphql";
import { useConference } from "../../../useConference";
import { useVonageLayout } from "../Vonage/VonageLayoutProvider";
import { PairLayoutForm } from "./PairLayoutForm";
import { PictureInPictureLayoutForm } from "./PictureInPictureLayoutForm";
import { SingleLayoutForm } from "./SingleLayoutForm";

gql`
    mutation BroadcastControlPanel_InsertEventVonageSessionLayout(
        $eventVonageSessionId: uuid!
        $layoutData: jsonb!
        $conferenceId: uuid!
    ) {
        insert_video_EventVonageSessionLayout(
            objects: {
                eventVonageSessionId: $eventVonageSessionId
                layoutData: $layoutData
                conferenceId: $conferenceId
            }
        ) {
            returning {
                id
            }
        }
    }
`;

export function BroadcastControlPanel({
    streams,
    eventVonageSessionId,
}: {
    streams: readonly EventParticipantStreamDetailsFragment[] | null;
    eventVonageSessionId: string | null;
}): JSX.Element {
    const [updateLayout] = useBroadcastControlPanel_InsertEventVonageSessionLayoutMutation();
    const toast = useToast();
    const layout = useVonageLayout();
    const { id: conferenceId } = useConference();

    const setLayout = useCallback(
        async (layoutData: VonageSessionLayoutData) => {
            if (!eventVonageSessionId) {
                console.error("No Vonage session available for layout update");
                throw new Error("No Vonage session available for layout update");
            }

            try {
                await updateLayout({
                    variables: {
                        eventVonageSessionId,
                        layoutData,
                        conferenceId,
                    },
                });
            } catch (e) {
                console.error("Failed to update layout of Vonage broadcast", e);
                toast({
                    status: "error",
                    title: "Could not set the broadcast layout",
                    description: "If this error persists, you may need to leave and re-enter the room.",
                });
            }
        },
        [conferenceId, eventVonageSessionId, toast, updateLayout]
    );
    const el = useMemo(
        (): JSX.Element => (
            <>
                <Text>{layout?.currentLayout?.type ?? "unknown layout"}</Text>
                <Accordion>
                    <AccordionItem>
                        <AccordionButton>Auto layout</AccordionButton>
                        <AccordionPanel>
                            <Button
                                colorScheme="purple"
                                aria-label="Set stream layout to automatic mode"
                                onClick={() => setLayout({ type: VonageSessionLayoutType.BestFit })}
                                isDisabled={!streams || !streams.length}
                            >
                                Auto layout
                            </Button>
                        </AccordionPanel>
                    </AccordionItem>
                    <AccordionItem>
                        <AccordionButton>Side-by-side layout</AccordionButton>
                        <AccordionPanel>
                            <PairLayoutForm streams={streams ?? []} setLayout={setLayout} />
                        </AccordionPanel>
                    </AccordionItem>
                    <AccordionItem>
                        <AccordionButton>Fullscreen layout</AccordionButton>
                        <AccordionPanel>
                            <SingleLayoutForm streams={streams ?? []} setLayout={setLayout} />
                        </AccordionPanel>
                    </AccordionItem>
                    <AccordionItem>
                        <AccordionButton>Picture-in-picture layout</AccordionButton>
                        <AccordionPanel>
                            <PictureInPictureLayoutForm streams={streams ?? []} setLayout={setLayout} />
                        </AccordionPanel>
                    </AccordionItem>
                </Accordion>
            </>
        ),
        [layout?.currentLayout?.type, setLayout, streams]
    );

    return el;
}
