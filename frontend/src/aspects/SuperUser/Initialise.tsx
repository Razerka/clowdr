import { gql } from "@apollo/client";
import { Alert, AlertDescription, AlertTitle, Button, Text } from "@chakra-ui/react";
import React from "react";
import { useInitialiseSuperUserMutation } from "../../generated/graphql";

gql`
    mutation InitialiseSuperUser {
        initialiseSuperUser {
            success
            error
        }
    }
`;

export default function SuperUserInitialise(): JSX.Element {
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
