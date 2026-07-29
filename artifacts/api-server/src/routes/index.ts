import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storageRouter from "./storage";
import venuesRouter from "./venues";
import sessionsRouter from "./sessions";
import galleryStylesRouter from "./galleryStyles";
import billingRouter from "./billing";
import dressesRouter from "./dresses";
import lookbooksRouter from "./lookbooks";
import reactionsRouter from "./reactions";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);
router.use(venuesRouter);
router.use(sessionsRouter);
router.use(galleryStylesRouter);
router.use(billingRouter);
router.use(dressesRouter);
router.use(lookbooksRouter);
router.use(reactionsRouter);

export default router;
