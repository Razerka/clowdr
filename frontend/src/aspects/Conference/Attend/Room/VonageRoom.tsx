import { gql } from "@apollo/client";
import { Box, useToast, VStack } from "@chakra-ui/react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useGetRoomVonageTokenMutation } from "../../../../generated/graphql";
import useOpenTok from "../../../Vonage/useOpenTok";
import useSessionEventHandler, { EventMap } from "../../../Vonage/useSessionEventHandler";
import { useVonageRoom } from "../../../Vonage/useVonageRoom";
import { PreJoin } from "./PreJoin";
import { VonageRoomControlBar } from "./VonageRoomControlBar";

gql`
    mutation GetRoomVonageToken($roomId: uuid!) {
        joinRoomVonageSession(roomId: $roomId) {
            accessToken
            sessionId
        }
    }
`;

export default function VonageRoom({
    roomId,
}: // publicVonageSessionId,
{
    roomId: string;
    // publicVonageSessionId: string;
}): JSX.Element {
    const [openTokProps, openTokMethods] = useOpenTok();
    const { state, computedState, dispatch } = useVonageRoom();
    const [vonageSessionId, setVonageSessionId] = useState<string | null>(null);
    const [getRoomVonageToken] = useGetRoomVonageTokenMutation({
        variables: {
            roomId,
        },
    });
    const toast = useToast();
    const videoContainerRef = useRef<HTMLDivElement>(null);
    const cameraPreviewRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        async function fn() {
            const result = await getRoomVonageToken();
            setVonageSessionId(result.data?.joinRoomVonageSession?.sessionId ?? null);
        }
        fn();
    }, [getRoomVonageToken]);

    useEffect(() => {
        async function initSession() {
            if (!vonageSessionId) {
                return;
            }

            if (openTokProps.isSessionInitialized) {
                return;
            }

            await openTokMethods.initSession({
                apiKey: import.meta.env.SNOWPACK_PUBLIC_OPENTOK_API_KEY,
                sessionId: vonageSessionId,
                sessionOptions: {},
            });
        }
        initSession();
    }, [getRoomVonageToken, openTokMethods, openTokProps.isSessionInitialized, vonageSessionId]);

    const joinRoom = useCallback(async () => {
        console.log("Joining room");
        const result = await getRoomVonageToken();

        if (!result.data?.joinRoomVonageSession?.accessToken || !result.data.joinRoomVonageSession.sessionId) {
            return;
        }

        try {
            if (!openTokProps.session) {
                throw new Error("No session");
            }

            await openTokMethods.connectSession(result.data.joinRoomVonageSession.accessToken, openTokProps.session);
        } catch (e) {
            console.error("Failed to join room", e);
            toast({
                status: "error",
                description: "Cannot connect to room",
            });
        }
    }, [getRoomVonageToken, openTokMethods, openTokProps.session, toast]);

    useEffect(() => {
        if (!videoContainerRef.current) {
            throw new Error("No element to publish to");
        }

        if (computedState.videoTrack && openTokProps.publisher["camera"]) {
            openTokMethods.republish({
                name: "camera",
                element: videoContainerRef.current,
                options: {
                    videoSource: computedState.videoTrack?.getSettings().deviceId,
                    audioSource: computedState.audioTrack?.getSettings().deviceId,
                    publishAudio: state.microphoneIntendedEnabled,
                    publishVideo: state.cameraIntendedEnabled,
                    insertMode: "append",
                    style: {},
                    facingMode: "user",
                    height: 300,
                    width: 300,
                },
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [computedState.videoTrack]);

    useEffect(() => {
        if (!videoContainerRef.current) {
            throw new Error("No element to publish to");
        }

        if (openTokProps.publisher["camera"] && !state.cameraIntendedEnabled) {
            openTokMethods.republish({
                name: "camera",
                element: videoContainerRef.current,
                options: {
                    videoSource: computedState.videoTrack?.getSettings().deviceId,
                    audioSource: computedState.audioTrack?.getSettings().deviceId,
                    publishAudio: state.microphoneIntendedEnabled,
                    publishVideo: state.cameraIntendedEnabled,
                    insertMode: "append",
                    style: {},
                    facingMode: "user",
                    height: 300,
                    width: 300,
                },
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.cameraIntendedEnabled]);

    useEffect(() => {
        if (openTokProps.publisher["camera"]) {
            if (computedState.audioTrack) {
                openTokProps.publisher["camera"].publishAudio(true);
                openTokProps.publisher["camera"].setAudioSource(computedState.audioTrack);
            } else {
                openTokProps.publisher["camera"].publishAudio(false);
                openTokProps.publisher["camera"].setAudioSource(false);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [computedState.audioTrack]);

    const streamCreatedHandler = useCallback(
        (event: EventMap["streamCreated"]) => {
            console.log("Stream created", event.stream.streamId);
            openTokMethods.subscribe({
                stream: event.stream,
                element: videoContainerRef.current ?? undefined,
                options: {
                    insertMode: "append",
                    height: "300",
                    width: "300",
                },
            });
        },
        [openTokMethods]
    );
    useSessionEventHandler("streamCreated", streamCreatedHandler, openTokProps.session);

    const streamDestroyedHandler = useCallback(
        (event: EventMap["streamDestroyed"]) => {
            console.log("Stream destroyed", event.stream.streamId);
            openTokMethods.unsubscribe({
                stream: event.stream,
            });
        },
        [openTokMethods]
    );
    useSessionEventHandler("streamDestroyed", streamDestroyedHandler, openTokProps.session);

    const sessionConnectedHandler = useCallback(
        async (event: EventMap["sessionConnected"]) => {
            console.log("Session connected", event.target.sessionId);

            if (!videoContainerRef.current) {
                throw new Error("No element to publish to");
            }

            if (!openTokProps.publisher["camera"]) {
                console.log("Publishing camera");
                await openTokMethods.publish({
                    name: "camera",
                    element: videoContainerRef.current,
                    options: {
                        videoSource: computedState.videoTrack?.getSettings().deviceId,
                        audioSource: computedState.audioTrack?.getSettings().deviceId,
                        publishAudio: state.microphoneIntendedEnabled,
                        publishVideo: state.cameraIntendedEnabled,
                        insertMode: "append",
                        style: {},
                        height: 300,
                        width: 300,
                    },
                });
            }
        },
        [
            openTokProps.publisher,
            openTokMethods,
            computedState.videoTrack,
            computedState.audioTrack,
            state.microphoneIntendedEnabled,
            state.cameraIntendedEnabled,
        ]
    );
    useSessionEventHandler("sessionConnected", sessionConnectedHandler, openTokProps.session);

    const sessionDisconnectedHandler = useCallback(
        (event: EventMap["sessionDisconnected"]) => {
            console.log("Session disconnected", event.target.sessionId);
            if (openTokProps.publisher["camera"]) {
                console.log("Unpublishing camera");
                openTokMethods.unpublish({ name: "camera" });
            }
        },
        [openTokMethods, openTokProps.publisher]
    );
    useSessionEventHandler("sessionDisconnected", sessionDisconnectedHandler, openTokProps.session);

    const leaveRoom = useCallback(() => {
        if (openTokProps.isSessionConnected) {
            openTokMethods.disconnectSession();
        }
    }, [openTokMethods, openTokProps.isSessionConnected]);

    return (
        <Box minH="100%" display="grid" gridTemplateRows="1fr auto">
            <Box position="relative">
                <Box position="absolute" width="100%" height="100%" ref={videoContainerRef} overflowY="auto"></Box>
                {openTokProps.session?.connection ? (
                    <></>
                ) : (
                    <VStack justifyContent="center" height="100%" position="absolute" width="100%">
                        <Box height="50%">
                            <PreJoin cameraPreviewRef={cameraPreviewRef} />
                        </Box>
                    </VStack>
                )}
            </Box>
            <VonageRoomControlBar
                onJoinRoom={joinRoom}
                onLeaveRoom={leaveRoom}
                inRoom={openTokProps.isSessionConnected}
            />
        </Box>
    );
}
