interface AuthPayload {
    headers: {
        "x-hasura-conference-slug"?: string;
        "x-hasura-magic-token"?: string;
        "x-hasura-role"?: string;
        "X-Hasura-Conference-Slug"?: string;
        "X-Hasura-Magic-Token"?: string;
        "X-Hasura-Role"?: string;
        Authorization?: string;
        authorization?: string;
    };
    request?: {
        variables?: Record<string, any>;
        operationName?: string;
        query: string;
    } | null;
}
