import { gql } from "@apollo/client";
import { Code, Container, Heading, Text, VStack } from "@chakra-ui/react";
import React from "react";
import { useSuperUserStateQuery } from "../../generated/graphql";
import CenteredSpinner from "../Chakra/CenteredSpinner";
import { useTitle } from "../Utils/useTitle";
import SuperUserInitialise from "./Initialise";
import SuperUserLandingPageContent from "./LandingPageContent";

gql`
    query SuperUserState {
        system_SuperUserState {
            isInitialised
            canBeDirectlyInitialised
        }
    }
`;

export default function SuperUserLandingPage(): JSX.Element {
    const title = useTitle("Super User");

    const suStateResponse = useSuperUserStateQuery({
        context: {
            headers: {
                "x-hasura-role": "superuser",
            },
        },
    });

    return (
        <VStack w="100%" mt={2} spacing={4}>
            {title}
            <Heading>Super User</Heading>
            {suStateResponse.loading && !suStateResponse.data?.system_SuperUserState.length ? (
                <CenteredSpinner />
            ) : undefined}
            {suStateResponse.data?.system_SuperUserState.length ? (
                suStateResponse.data.system_SuperUserState[0].isInitialised ? (
                    <SuperUserLandingPageContent />
                ) : suStateResponse.data.system_SuperUserState[0].canBeDirectlyInitialised ? (
                    <SuperUserInitialise />
                ) : (
                    <>
                        <Container>
                            <Text>
                                A super user is not initialised and cannot be initialised directly through the UI.
                                Direct initialisation is only available when only a single user exists.
                            </Text>
                        </Container>
                        <Container>
                            <Text>
                                To initialise a super user, please create the relevent Super User Permission Grant
                                record directly in Hasura (look in the <Code>system</Code> schema). Insert a record for
                                your user id, granting the permission <Code>INSERT_SU_PERMISSION</Code>
                                with the target permission also being <Code>INSERT_SU_PERMISSION</Code>. Then reload
                                this page.
                            </Text>
                        </Container>
                    </>
                )
            ) : undefined}
        </VStack>
    );
}
