import * as cart from '../services/cart.service.js';
import * as reviews from '../services/review.service.js';
import * as orders from '../services/order.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created, noContent } from '../utils/respond.js';
import { toInt } from '../utils/query.js';

/* ---------------- cart ---------------- */

export const getCart = asyncHandler(async (req, res) => {
  ok(res, await cart.getCart(req.user.id));
});

export const addItem = asyncHandler(async (req, res) => {
  created(res, await cart.addToCart(req.user.id, req.body));
});

export const addMany = asyncHandler(async (req, res) => {
  created(res, await cart.addMany(req.user.id, req.body.items ?? []));
});

export const updateItem = asyncHandler(async (req, res) => {
  ok(res, await cart.updateCartItem(req.user.id, req.body));
});

export const removeItem = asyncHandler(async (req, res) => {
  ok(res, await cart.removeFromCart(req.user.id, toInt(req.params.id)));
});

export const clear = asyncHandler(async (req, res) => {
  ok(res, await cart.clearCart(req.user.id));
});

/* ---------------- reviews (customer) ---------------- */

export const createReview = asyncHandler(async (req, res) => {
  created(res, await reviews.createReview(req.user.id, req.body));
});

export const updateReview = asyncHandler(async (req, res) => {
  ok(res, await reviews.updateMyReview(req.user.id, toInt(req.params.id), req.body));
});

export const deleteReview = asyncHandler(async (req, res) => {
  ok(res, await reviews.deleteMyReview(req.user.id, toInt(req.params.id)));
});

/* ---------------- orders ---------------- */

export const createOrder = asyncHandler(async (req, res) => {
  created(res, await orders.createOrder(req.user.id, req.body));
});

export const listMyOrders = asyncHandler(async (req, res) => {
  const result = await orders.listMyOrders(req.user.id, req.query);
  ok(res, result.data, result.meta);
});

export const getMyOrder = asyncHandler(async (req, res) => {
  ok(res, await orders.getMyOrder(req.user.id, toInt(req.params.id)));
});

export const cancelOrder = asyncHandler(async (req, res) => {
  ok(res, await orders.cancelMyOrder(req.user.id, toInt(req.params.id)));
});

/* ---------------- admin orders ---------------- */

export const listAllOrders = asyncHandler(async (req, res) => {
  const result = await orders.listAllOrders(req.query);
  ok(res, result.data, result.meta);
});

export const updateOrderStatus = asyncHandler(async (req, res) => {
  ok(res, await orders.updateOrderStatus(toInt(req.params.id), req.body.status));
});

export const dashboard = asyncHandler(async (req, res) => {
  ok(res, await orders.getDashboardStats());
});
