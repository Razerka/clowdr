import { json } from "body-parser";
import express, { Request, Response } from "express";
import { assertType } from "typescript-is";
import { handleEventVonageSessionLayoutCreated as handleEventVonageSessionLayoutCreated } from "../handlers/eventVonageSessionLayout";
import { checkEventSecret } from "../middlewares/checkEventSecret";
import { EventVonageSessionLayoutData, Payload } from "../types/hasura/event";

export const router = express.Router();

// Protected routes
router.use(checkEventSecret);

router.post("/created", json(), async (req: Request, res: Response) => {
    try {
        assertType<Payload<EventVonageSessionLayoutData>>(req.body);
    } catch (e) {
        console.error("Received incorrect payload", e);
        res.status(500).json("Unexpected payload");
        return;
    }
    try {
        await handleEventVonageSessionLayoutCreated(req.body);
    } catch (e) {
        console.error("Failure while handling eventVonageSessionLayout updated", e);
        res.status(500).json("Failure while handling event");
        return;
    }
    res.status(200).json("OK");
});
