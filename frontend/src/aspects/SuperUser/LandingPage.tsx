import { gql } from "@apollo/client";
import { Alert, AlertDescription, AlertTitle, Button, Code, Heading, Text, VStack } from "@chakra-ui/react";
import React from "react";
import { useInitialiseSuperUserMutation, useSuperUserStateQuery } from "../../generated/graphql";
import CenteredSpinner from "../Chakra/CenteredSpinner";
import { useTitle } from "../Utils/useTitle";

gql`
    query SuperUserState {
        system_SuperUserState {
            isInitialised
            canBeDirectlyInitialised
        }
    }

    mutation InitialiseSuperUser {
        initialiseSuperUser {
            success
            error
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
        <VStack w="100%">
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
                        <Text>
                            Super user is not initialised and cannot be initialised directly through the UI. Direct
                            initialisation is only available when a single user exists.
                        </Text>
                        <Text>
                            To initialise a super user, please create the relevent Super User Permission Grant record
                            directly in Hasura (system schema). Insert a record for your user id, granting the
                            permission <Code>INSERT_SU_PERMISSION</Code>
                            with the target permission also being <Code>INSERT_SU_PERMISSION</Code>. Then reload this
                            page.
                        </Text>
                    </>
                )
            ) : undefined}
        </VStack>
    );
}

function SuperUserInitialise(): JSX.Element {
    const [initialiseMutation, initialiseResponse] = useInitialiseSuperUserMutation({
        context: {
            headers: {
                "x-hasura-role": "superuser",
            },
        },
    });

    // TODO: System initialisation (when there's only a single user)
    return (
        <>
            {initialiseResponse.data?.initialiseSuperUser?.error ? (
                <Alert status="error">
                    <AlertTitle>Error initialising super user.</AlertTitle>
                    <AlertDescription>{initialiseResponse.data.initialiseSuperUser.error}</AlertDescription>
                </Alert>
            ) : undefined}
            {initialiseResponse.data?.initialiseSuperUser?.success ? (
                <Alert status="success">
                    <AlertTitle>Super user initialised!</AlertTitle>
                    <AlertDescription>Please refresh the page.</AlertDescription>
                </Alert>
            ) : initialiseResponse.data?.initialiseSuperUser?.success === false ? (
                <Alert status="error">
                    <AlertTitle>Super user not initialised.</AlertTitle>
                    <AlertDescription>Please refresh the page.</AlertDescription>
                </Alert>
            ) : undefined}
            <Text>Super user is not yet initialised. One-click initialisation is available.</Text>
            <Button
                isLoading={initialiseResponse.loading}
                isDisabled={!!initialiseResponse.data?.initialiseSuperUser?.success}
                onClick={() => {
                    initialiseMutation();
                }}
            >
                Initialise super user
            </Button>
        </>
    );
}

function SuperUserLandingPageContent(): JSX.Element {
    /*
        TODO: Manage Super User Permission Grants
        TODO: Manage System Configuration Permission Grants
        TODO: Manage System Configurations
        TODO: Manage Conference Demo Codes
    */

    return <>TODO</>;
}
