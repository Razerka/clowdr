import { gql } from "@apollo/client/core";
import { InitialiseSuperUserStateDocument, SuperUserStateDocument } from "../generated/graphql";
import { apolloClient } from "../graphqlClient";

gql`
    query SuperUserState {
        system_SuperUserState {
            isInitialised
            canBeDirectlyInitialised
        }
        User(limit: 1) {
            id
        }
    }

    mutation InitialiseSuperUserState($userId: String!) {
        insert_system_SuperUserPermissionGrant(
            objects: [
                {
                    grantedPermissionName: INSERT_SU_PERMISSION
                    userId: $userId
                    targetPermissionName: INSERT_SU_PERMISSION
                }
            ]
        ) {
            id
        }
    }
`;

export async function handleInitialiseSuperUser(): Promise<InitialiseSuperUserOutput> {
    try {
        const queryResponse = await apolloClient.query({
            query: SuperUserStateDocument,
        });

        if (queryResponse.data.system_SuperUserState.length === 0) {
            throw new Error("Super user state view returned no rows?!");
        }

        if (queryResponse.data.system_SuperUserState[0].isInitialised) {
            return { success: false, error: "Super user is already initialised." };
        }

        if (!queryResponse.data.system_SuperUserState[0].canBeDirectlyInitialised) {
            return {
                success: false,
                error: "Super user cannot be directly initialised. Can only be initialised directly if exactly one user exists. Please insert the permission grant manually into Hasura: System.SuperUserPermissionGrant (INSERT_SU_PERMISSION, your user id, INSERT_SU_PERMISSION).",
            };
        }

        if (queryResponse.data.User.length !== 1) {
            return {
                success: false,
                error: "Super user cannot be directly initialised. No single user available. Not sure how this can have happened because the other checks should have prevented it.",
            };
        }

        await apolloClient.mutate({
            mutation: InitialiseSuperUserStateDocument,
            variables: {
                userId: queryResponse.data.User[0].id,
            },
        });

        return { success: true, error: null };
    } catch (e) {
        console.error("Unable to fetch current super state", e);
        return { success: false, error: "Could not fetch current super user state." };
    }
}
