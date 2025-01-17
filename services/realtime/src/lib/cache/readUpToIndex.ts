import { gql } from "@apollo/client/core";
import { ReadUpToIndexDocument } from "../../generated/graphql";
import { redisClientP } from "../../redis";
import { testMode } from "../../testMode";
import { Cache } from "./cache";

gql`
    query ReadUpToIndex($chatId: uuid!, $userId: String!) {
        chat_ReadUpToIndex(where: { chatId: { _eq: $chatId }, registrant: { userId: { _eq: $userId } } }) {
            chatId
            registrantId
            messageSId
        }
    }
`;

export type ReadUpToIndex = {
    chatId: string;
    userId: string;
    messageSId: string | undefined;
};

const ReadUpToIndexCache = new Cache<ReadUpToIndex>(
    "caches:ReadUpToIndex",
    async (key, testMode_ExpectedValue) => {
        return testMode(
            async (apolloClient) => {
                const keyParts = key.split("¬");
                const chatId = keyParts[0];
                const userId = keyParts[1];
                const response = await apolloClient.query({
                    query: ReadUpToIndexDocument,
                    variables: {
                        chatId,
                        userId,
                    },
                });

                const result: ReadUpToIndex | undefined =
                    response.data.chat_ReadUpToIndex.length > 0
                        ? {
                              chatId,
                              userId,
                              messageSId: response.data.chat_ReadUpToIndex[0].messageSId ?? undefined,
                          }
                        : undefined;

                return result;
            },
            async () => testMode_ExpectedValue
        );
    },
    JSON.stringify,
    JSON.parse,
    24 * 60 * 60 * 1000,
    5 * 60 * 1000
);

export async function getReadUpToIndex(
    chatId: string,
    userId: string,
    testMode_ExpectedInfo: ReadUpToIndex,
    refetchNow = false
): Promise<ReadUpToIndex | undefined> {
    const key = chatId + "¬" + userId;
    const info = await ReadUpToIndexCache.get(key, testMode_ExpectedInfo, refetchNow);
    if (!info && !refetchNow) {
        return getReadUpToIndex(chatId, userId, testMode_ExpectedInfo, true);
    }
    return info;
}

const modifiedSetKey = "caches:ReadUpToIndex:modified";

export async function setReadUpToIndex(chatId: string, userId: string, messageSId: string): Promise<void> {
    const key = chatId + "¬" + userId;
    await ReadUpToIndexCache.set(key, {
        chatId,
        messageSId,
        userId,
    });

    await redisClientP.sadd(modifiedSetKey, key);
}

export async function getAndClearModified(): Promise<ReadUpToIndex[]> {
    const keys = await redisClientP.smembers(modifiedSetKey);
    await redisClientP.del(modifiedSetKey);
    return (await Promise.all(keys.map((key) => ReadUpToIndexCache.get(key, undefined)))).filter(
        (x) => !!x
    ) as ReadUpToIndex[];
}
