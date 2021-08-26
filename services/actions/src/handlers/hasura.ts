export async function handleAuthWebhook(
    payload: AuthPayload,
    userId: string | undefined
): Promise<false | Record<string, any>> {
    const result: Record<string, any> = {
        "x-hasura-conference-slug":
            payload.headers["x-hasura-conference-slug"] ?? payload.headers["X-Hasura-Conference-Slug"],
        "x-hasura-magic-token": payload.headers["x-hasura-magic-token"] ?? payload.headers["X-Hasura-Magic-Token"],
    };
    if (userId) {
        result["x-hasura-role"] = payload.headers["x-hasura-role"] ?? payload.headers["X-Hasura-Role"] ?? "user";
        result["x-hasura-user-id"] = userId;
    } else {
        result["x-hasura-role"] = "unauthenticated";
    }
    return result;
}
