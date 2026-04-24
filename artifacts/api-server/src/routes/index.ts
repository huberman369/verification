import { Router, type IRouter } from "express";
import healthRouter from "./health";
import forensicRouter from "./forensic";

const router: IRouter = Router();

router.use(healthRouter);
router.use(forensicRouter);

export default router;
