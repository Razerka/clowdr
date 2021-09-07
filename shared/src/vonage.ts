import { assertType, is } from "typescript-is";

export type VonageSessionLayoutData = BestFitLayout | PictureInPictureLayout | SingleLayout | PairLayout;

export enum VonageSessionLayoutType {
    BestFit = "BEST_FIT",
    PictureInPicture = "PICTURE_IN_PICTURE",
    Single = "SINGLE",
    Pair = "PAIR",
}

export interface BestFitLayout {
    type: VonageSessionLayoutType.BestFit;
}

export interface PictureInPictureLayout {
    type: VonageSessionLayoutType.PictureInPicture;
    focusStreamId: string;
    cornerStreamId: string;
}

export interface SingleLayout {
    type: VonageSessionLayoutType.Single;
    focusStreamId: string;
}

export interface PairLayout {
    type: VonageSessionLayoutType.Pair;
    leftStreamId: string;
    rightStreamId: string;
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function isVonageSessionLayoutData(data: any): boolean {
    return is<VonageSessionLayoutData>(data);
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function assertVonageSessionLayoutData(data: any): asserts data is VonageSessionLayoutData {
    assertType<VonageSessionLayoutData>(data);
}
