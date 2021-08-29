import { Accordion, AccordionButton, AccordionIcon, AccordionItem, AccordionPanel } from "@chakra-ui/react";
import React from "react";
import HowSUWorks from "./Panels/HowSUWorks";
import SUPermissionsTable from "./Panels/SUPermissionsTable";

export default function SuperUserLandingPageContent(): JSX.Element {
    /*
        TODO: Manage Super User Permission Grants
        TODO: Manage System Configuration Permission Grants
        TODO: Manage System Configurations
        TODO: Manage Conference Demo Codes
    */

    return (
        <>
            <Accordion w="100%" allowMultiple reduceMotion>
                <AccordionItem>
                    <AccordionButton
                        bgColor="purple.600"
                        color="white"
                        fontWeight="bold"
                        _hover={{
                            bgColor: "purple.400",
                        }}
                    >
                        <AccordionIcon mr={2} />
                        How do super user permissions work?
                    </AccordionButton>
                    <AccordionPanel>
                        <HowSUWorks />
                    </AccordionPanel>
                </AccordionItem>
                <AccordionItem>
                    <AccordionButton
                        bgColor="blue.600"
                        color="white"
                        fontWeight="bold"
                        _hover={{
                            bgColor: "blue.400",
                        }}
                    >
                        <AccordionIcon mr={2} />
                        Table of Super User Permissions
                    </AccordionButton>
                    <AccordionPanel>
                        <SUPermissionsTable />
                    </AccordionPanel>
                </AccordionItem>
                <AccordionItem>
                    <AccordionButton>
                        <AccordionIcon mr={2} />
                        Super User Permission Grants
                    </AccordionButton>
                    <AccordionPanel>TODO</AccordionPanel>
                </AccordionItem>
                <AccordionItem>
                    <AccordionButton>
                        <AccordionIcon mr={2} />
                        System Configuration Permission Grants
                    </AccordionButton>
                    <AccordionPanel>TODO</AccordionPanel>
                </AccordionItem>
                <AccordionItem>
                    <AccordionButton>
                        <AccordionIcon mr={2} />
                        System Configuration
                    </AccordionButton>
                    <AccordionPanel>TODO</AccordionPanel>
                </AccordionItem>
                <AccordionItem>
                    <AccordionButton>
                        <AccordionIcon mr={2} />
                        Conference Demo Codes
                    </AccordionButton>
                    <AccordionPanel>TODO</AccordionPanel>
                </AccordionItem>
            </Accordion>
        </>
    );
}
