import { gql } from "@apollo/client";
import {
    assertVonageSessionLayoutData,
    VonageSessionLayoutData,
    VonageSessionLayoutType,
} from "@clowdr-app/shared-types/build/vonage";
import React, { PropsWithChildren, useEffect, useMemo, useState } from "react";
import { useVonageLayoutProvider_GetLatestEventVonageSessionLayoutQuery } from "../../../../../generated/graphql";

gql`
    query VonageLayoutProvider_GetLatestEventVonageSessionLayout($eventId: uuid!) {
        video_EventVonageSessionLayout(
            where: { eventVonageSession: { eventId: { _eq: $eventId } } }
            order_by: { created_at: desc }
            limit: 1
        ) {
            id
            layoutData
        }
    }
`;

export interface VonageLayout {
    currentLayout: VonageSessionLayoutData;
    updateCurrentLayout: (layout: VonageSessionLayoutData) => void;
}

export const VonageLayoutContext = React.createContext<VonageLayout | undefined>(undefined);

export function useVonageLayout(): VonageLayout {
    const ctx = React.useContext(VonageLayoutContext);
    if (!ctx) {
        throw new Error("Context not available - are you outside the provider?");
    }
    return ctx;
}

export function VonageLayoutProvider({ eventId, children }: PropsWithChildren<{ eventId: string }>): JSX.Element {
    const result = useVonageLayoutProvider_GetLatestEventVonageSessionLayoutQuery({
        variables: {
            eventId,
        },
    });
    const initialLayoutData = useMemo((): VonageSessionLayoutData | null => {
        if (!result.data?.video_EventVonageSessionLayout.length) {
            return null;
        }
        try {
            assertVonageSessionLayoutData(result.data.video_EventVonageSessionLayout[0].layoutData);
            return result.data.video_EventVonageSessionLayout[0].layoutData;
        } catch (e) {
            return null;
        }
    }, [result.data?.video_EventVonageSessionLayout]);
    const [layoutData, setLayoutData] = useState<VonageSessionLayoutData | null>(null);
    useEffect(() => {
        setLayoutData(null);
    }, [eventId]);

    const layout = useMemo(
        () => ({
            currentLayout: layoutData ?? initialLayoutData ?? { type: VonageSessionLayoutType.BestFit },
            updateCurrentLayout: setLayoutData,
        }),
        [initialLayoutData, layoutData]
    );

    return <VonageLayoutContext.Provider value={layout}>{children}</VonageLayoutContext.Provider>;
}
