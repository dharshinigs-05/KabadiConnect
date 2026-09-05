import { Router } from 'express';
import { routeParam } from '../lib/routeParams.js';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  transactionStatusSchema,
  traceEventCreateSchema,
  paymentCreateSchema,
  handoverConfirmSchema,
  handoverCreateSchema,
  pickupScheduleSchema,
  parseBody,
} from '../validators/schemas.js';
import {
  getTransaction,
  listTransactions,
  transitionStatus,
  getTransactionRisk,
  createTraceEvent,
  confirmHandover,
  recordPayment,
  getCollectorEarnings,
  schedulePickup,
  listTraceEvents,
  listPayments,
  recordVerifiedHandover,
} from '../services/transactions.service.js';

export const transactionsRouter = Router();

transactionsRouter.get('/', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const result = await listTransactions(
      req.user!,
      req.query.recycler_id as string | undefined,
      req.query.cursor as string | undefined,
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

transactionsRouter.get('/:id', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const tx = await getTransaction(routeParam(req.params.id), req.user!);
    res.json(tx);
  } catch (error) {
    next(error);
  }
});

transactionsRouter.patch('/:id/status', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { status } = parseBody(transactionStatusSchema, req.body);
    const tx = await transitionStatus(routeParam(req.params.id), req.user!, status);
    res.json(tx);
  } catch (error) {
    next(error);
  }
});

transactionsRouter.put('/:id/pickup', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const input = parseBody(pickupScheduleSchema, req.body);
    const pickup = await schedulePickup(routeParam(req.params.id), req.user!, input);
    res.json(pickup);
  } catch (error) {
    next(error);
  }
});

transactionsRouter.get('/:id/risk', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const risk = await getTransactionRisk(routeParam(req.params.id), req.user!);
    res.json(risk);
  } catch (error) {
    next(error);
  }
});

transactionsRouter.post('/:id/trace-events', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const input = parseBody(traceEventCreateSchema, req.body);
    const event = await createTraceEvent(routeParam(req.params.id), req.user!, input);
    res.status(201).json(event);
  } catch (error) {
    next(error);
  }
});

transactionsRouter.get('/:id/trace-events', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const history = await listTraceEvents(routeParam(req.params.id), req.user!, req.query.cursor as string | undefined);
    res.json(history);
  } catch (error) {
    next(error);
  }
});

transactionsRouter.post('/:id/handover', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const input = parseBody(handoverCreateSchema, req.body);
    const event = await recordVerifiedHandover(routeParam(req.params.id), req.user!, { ...input, photo_urls: input.photo_urls ?? [] });
    res.status(201).json(event);
  } catch (error) {
    next(error);
  }
});

transactionsRouter.post('/:id/payments', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const input = parseBody(paymentCreateSchema, req.body);
    const payment = await recordPayment(routeParam(req.params.id), req.user!, input);
    res.status(201).json(payment);
  } catch (error) {
    next(error);
  }
});

transactionsRouter.get('/:id/payments', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const payments = await listPayments(routeParam(req.params.id), req.user!, req.query.cursor as string | undefined);
    res.json(payments);
  } catch (error) {
    next(error);
  }
});

export const traceEventsRouter = Router();

traceEventsRouter.post('/:id/confirm', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { handover_reference_code } = parseBody(handoverConfirmSchema, req.body);
    const event = await confirmHandover(routeParam(req.params.id), req.user!, handover_reference_code);
    res.status(201).json(event);
  } catch (error) {
    next(error);
  }
});

export const collectorsRouter = Router();

collectorsRouter.get('/me/earnings', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const earnings = await getCollectorEarnings(req.user!);
    res.json(earnings);
  } catch (error) {
    next(error);
  }
});
