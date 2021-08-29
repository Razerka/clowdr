import { Container, Text, VStack } from "@chakra-ui/react";
import React from "react";

export default function HowSuperUserWorks(): JSX.Element {
    return (
        <Container ml={0}>
            <VStack spacing={4} alignItems="flex-start">
                <Text>
                    A super user is someone who has permission to edit one or more pieces of system-wide configuration
                    (as opposed to configuration of a specific conference - which is more generally known as an
                    &lsquo;instance&rsquo; in webdev terminology). A user is a super user if they have any super user
                    permission granted to them.
                </Text>
                <Text>
                    Midspace enables a multi-authority permission system meaning more than one user may have full
                    control over part or all of the system.
                </Text>
                <Text>
                    Super user permissions cover a number of areas of the system. First, there are Super User Permission
                    Grants - meaning the granting of Super User Permissions to users. In other words, a permission grant
                    gives to a specified user a particular super user permission. For example, the ability to grant
                    other users additional super user permissions.
                </Text>
                <Text>
                    Second, there are System Configuration Permission Grants. These determine permissions for viewing
                    and modifying the system configuration records. For example, the ability to edit the terms of
                    service URL.
                </Text>
                <Text>
                    Lastly, there are various specific permission grants covering other aspects of the system, such as
                    conference demo codes, specific conference configurations, and more. For example, a super user may
                    be given permission to view the list and state of conference demo codes.
                </Text>
                <Text>
                    Putting the various permissions together can form pretty much any organisational hierrarchy we are
                    likely to need. However, we recommend certain patterns/combinations, which we enable through
                    one-click setup options in the various sections.
                </Text>
                <Text>
                    The Table of Super User Permissions below contains a comprehensive description of each permission.
                </Text>
            </VStack>
        </Container>
    );
}
