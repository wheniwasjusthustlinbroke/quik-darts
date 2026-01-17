"use strict";
/**
 * Quik Darts Cloud Functions
 *
 * Server-authoritative game logic and coin economy.
 * All coin operations and game state changes go through these functions.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripeWebhook = exports.createStripeCheckout = exports.cleanupExpiredEscrows = exports.refundEscrow = exports.settleGame = exports.createEscrow = exports.forfeitGame = exports.submitThrow = exports.createGame = exports.getUnclaimedAdReward = exports.admobCallback = exports.claimAdReward = exports.claimDailyBonus = exports.initializeNewUser = void 0;
const admin = __importStar(require("firebase-admin"));
// Initialize Firebase Admin
admin.initializeApp();
// ============================================
// COINS - Award and manage coin balance
// ============================================
var initializeNewUser_1 = require("./coins/initializeNewUser");
Object.defineProperty(exports, "initializeNewUser", { enumerable: true, get: function () { return initializeNewUser_1.initializeNewUser; } });
var claimDailyBonus_1 = require("./coins/claimDailyBonus");
Object.defineProperty(exports, "claimDailyBonus", { enumerable: true, get: function () { return claimDailyBonus_1.claimDailyBonus; } });
var claimAdReward_1 = require("./coins/claimAdReward");
Object.defineProperty(exports, "claimAdReward", { enumerable: true, get: function () { return claimAdReward_1.claimAdReward; } });
var admobCallback_1 = require("./coins/admobCallback");
Object.defineProperty(exports, "admobCallback", { enumerable: true, get: function () { return admobCallback_1.admobCallback; } });
var getUnclaimedAdReward_1 = require("./coins/getUnclaimedAdReward");
Object.defineProperty(exports, "getUnclaimedAdReward", { enumerable: true, get: function () { return getUnclaimedAdReward_1.getUnclaimedAdReward; } });
// ============================================
// GAMEPLAY - Server-authoritative game logic
// ============================================
var createGame_1 = require("./gameplay/createGame");
Object.defineProperty(exports, "createGame", { enumerable: true, get: function () { return createGame_1.createGame; } });
var submitThrow_1 = require("./gameplay/submitThrow");
Object.defineProperty(exports, "submitThrow", { enumerable: true, get: function () { return submitThrow_1.submitThrow; } });
var forfeitGame_1 = require("./gameplay/forfeitGame");
Object.defineProperty(exports, "forfeitGame", { enumerable: true, get: function () { return forfeitGame_1.forfeitGame; } });
// ============================================
// WAGERING - Escrow and settlement
// ============================================
var createEscrow_1 = require("./wagering/createEscrow");
Object.defineProperty(exports, "createEscrow", { enumerable: true, get: function () { return createEscrow_1.createEscrow; } });
var settleGame_1 = require("./wagering/settleGame");
Object.defineProperty(exports, "settleGame", { enumerable: true, get: function () { return settleGame_1.settleGame; } });
var refundEscrow_1 = require("./wagering/refundEscrow");
Object.defineProperty(exports, "refundEscrow", { enumerable: true, get: function () { return refundEscrow_1.refundEscrow; } });
Object.defineProperty(exports, "cleanupExpiredEscrows", { enumerable: true, get: function () { return refundEscrow_1.cleanupExpiredEscrows; } });
// ============================================
// PAYMENTS - Stripe (Phase 5)
// ============================================
var createStripeCheckout_1 = require("./payments/createStripeCheckout");
Object.defineProperty(exports, "createStripeCheckout", { enumerable: true, get: function () { return createStripeCheckout_1.createStripeCheckout; } });
var stripeWebhook_1 = require("./payments/stripeWebhook");
Object.defineProperty(exports, "stripeWebhook", { enumerable: true, get: function () { return stripeWebhook_1.stripeWebhook; } });
// export { verifyApplePurchase } from './payments/verifyApplePurchase'; // TODO: Phase 5b
//# sourceMappingURL=index.js.map