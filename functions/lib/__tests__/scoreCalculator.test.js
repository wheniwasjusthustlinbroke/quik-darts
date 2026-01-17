"use strict";
/**
 * Score Calculator Tests
 */
Object.defineProperty(exports, "__esModule", { value: true });
const scoreCalculator_1 = require("../utils/scoreCalculator");
describe('calculateScoreFromPosition', () => {
    describe('Bullseye', () => {
        it('should return 50 for inner bullseye (center)', () => {
            const result = (0, scoreCalculator_1.calculateScoreFromPosition)(scoreCalculator_1.CENTER, scoreCalculator_1.CENTER);
            expect(result.score).toBe(50);
            expect(result.label).toBe('BULL');
            expect(result.multiplier).toBe(1);
        });
        it('should return 50 for dart just inside inner bull', () => {
            const result = (0, scoreCalculator_1.calculateScoreFromPosition)(scoreCalculator_1.CENTER + scoreCalculator_1.INNER_BULL - 1, scoreCalculator_1.CENTER);
            expect(result.score).toBe(50);
            expect(result.label).toBe('BULL');
        });
        it('should return 25 for outer bullseye', () => {
            const result = (0, scoreCalculator_1.calculateScoreFromPosition)(scoreCalculator_1.CENTER + scoreCalculator_1.INNER_BULL + 3, scoreCalculator_1.CENTER);
            expect(result.score).toBe(25);
            expect(result.label).toBe('25');
            expect(result.multiplier).toBe(1);
        });
    });
    describe('Doubles', () => {
        it('should return double score for double ring hit', () => {
            // Hit in double ring area at top (20 segment)
            const result = (0, scoreCalculator_1.calculateScoreFromPosition)(scoreCalculator_1.CENTER, scoreCalculator_1.CENTER - scoreCalculator_1.DOUBLE_INNER - 5);
            expect(result.multiplier).toBe(2);
            expect(result.label).toMatch(/^D\d+$/);
        });
        it('should double the base score', () => {
            const result = (0, scoreCalculator_1.calculateScoreFromPosition)(scoreCalculator_1.CENTER, scoreCalculator_1.CENTER - scoreCalculator_1.DOUBLE_INNER - 5);
            if (result.base) {
                expect(result.score).toBe(result.base * 2);
            }
        });
    });
    describe('Triples', () => {
        it('should return triple score for triple ring hit', () => {
            // Hit in triple ring area at top (20 segment)
            const result = (0, scoreCalculator_1.calculateScoreFromPosition)(scoreCalculator_1.CENTER, scoreCalculator_1.CENTER - scoreCalculator_1.TRIPLE_INNER - 5);
            expect(result.multiplier).toBe(3);
            expect(result.label).toMatch(/^T\d+$/);
        });
        it('should triple the base score', () => {
            const result = (0, scoreCalculator_1.calculateScoreFromPosition)(scoreCalculator_1.CENTER, scoreCalculator_1.CENTER - scoreCalculator_1.TRIPLE_INNER - 5);
            if (result.base) {
                expect(result.score).toBe(result.base * 3);
            }
        });
    });
    describe('Singles', () => {
        it('should return single score for regular area', () => {
            // Hit in single area between outer bull and triple
            const result = (0, scoreCalculator_1.calculateScoreFromPosition)(scoreCalculator_1.CENTER, scoreCalculator_1.CENTER - 60);
            expect(result.multiplier).toBe(1);
            expect(result.label).toMatch(/^\d+$/);
        });
    });
    describe('Miss', () => {
        it('should return 0 for miss (outside board)', () => {
            const result = (0, scoreCalculator_1.calculateScoreFromPosition)(0, 0);
            expect(result.score).toBe(0);
            expect(result.label).toBe('MISS');
            expect(result.multiplier).toBe(0);
        });
        it('should return 0 for dart outside double ring', () => {
            const result = (0, scoreCalculator_1.calculateScoreFromPosition)(scoreCalculator_1.CENTER, scoreCalculator_1.CENTER - scoreCalculator_1.DOUBLE_OUTER - 50);
            expect(result.score).toBe(0);
            expect(result.label).toBe('MISS');
        });
    });
});
describe('isValidDartPosition', () => {
    it('should return true for valid position at center', () => {
        expect((0, scoreCalculator_1.isValidDartPosition)({ x: scoreCalculator_1.CENTER, y: scoreCalculator_1.CENTER })).toBe(true);
    });
    it('should return true for valid position at edge', () => {
        expect((0, scoreCalculator_1.isValidDartPosition)({ x: 0, y: 0 })).toBe(true);
        expect((0, scoreCalculator_1.isValidDartPosition)({ x: scoreCalculator_1.BOARD_SIZE, y: scoreCalculator_1.BOARD_SIZE })).toBe(true);
    });
    it('should return false for null position', () => {
        expect((0, scoreCalculator_1.isValidDartPosition)(null)).toBe(false);
    });
    it('should return false for undefined position', () => {
        expect((0, scoreCalculator_1.isValidDartPosition)(undefined)).toBe(false);
    });
    it('should return false for non-object', () => {
        expect((0, scoreCalculator_1.isValidDartPosition)('string')).toBe(false);
    });
    it('should return false for missing x', () => {
        expect((0, scoreCalculator_1.isValidDartPosition)({ y: 100 })).toBe(false);
    });
    it('should return false for missing y', () => {
        expect((0, scoreCalculator_1.isValidDartPosition)({ x: 100 })).toBe(false);
    });
    it('should return false for negative x', () => {
        expect((0, scoreCalculator_1.isValidDartPosition)({ x: -1, y: 100 })).toBe(false);
    });
    it('should return false for negative y', () => {
        expect((0, scoreCalculator_1.isValidDartPosition)({ x: 100, y: -1 })).toBe(false);
    });
    it('should return false for x > BOARD_SIZE', () => {
        expect((0, scoreCalculator_1.isValidDartPosition)({ x: scoreCalculator_1.BOARD_SIZE + 1, y: 100 })).toBe(false);
    });
    it('should return false for y > BOARD_SIZE', () => {
        expect((0, scoreCalculator_1.isValidDartPosition)({ x: 100, y: scoreCalculator_1.BOARD_SIZE + 1 })).toBe(false);
    });
    it('should return false for NaN', () => {
        expect((0, scoreCalculator_1.isValidDartPosition)({ x: NaN, y: 100 })).toBe(false);
    });
    it('should return false for Infinity', () => {
        expect((0, scoreCalculator_1.isValidDartPosition)({ x: Infinity, y: 100 })).toBe(false);
    });
});
describe('isBust', () => {
    it('should return false for valid throw', () => {
        expect((0, scoreCalculator_1.isBust)(100, 20, 1)).toBe(false);
    });
    it('should return true for negative score', () => {
        expect((0, scoreCalculator_1.isBust)(40, 60, 1)).toBe(true);
    });
    it('should return true for score of 1', () => {
        expect((0, scoreCalculator_1.isBust)(41, 40, 2)).toBe(true);
    });
    it('should return true for checkout without double', () => {
        expect((0, scoreCalculator_1.isBust)(20, 20, 1)).toBe(true);
    });
    it('should return false for valid double checkout', () => {
        expect((0, scoreCalculator_1.isBust)(40, 40, 2)).toBe(false);
    });
    it('should return false for score of 2 (possible D1)', () => {
        expect((0, scoreCalculator_1.isBust)(40, 38, 1)).toBe(false);
    });
});
describe('isCheckout', () => {
    it('should return true for valid double checkout', () => {
        expect((0, scoreCalculator_1.isCheckout)(40, 40, 2)).toBe(true);
    });
    it('should return false for single that equals score', () => {
        expect((0, scoreCalculator_1.isCheckout)(20, 20, 1)).toBe(false);
    });
    it('should return false for triple that equals score', () => {
        expect((0, scoreCalculator_1.isCheckout)(60, 60, 3)).toBe(false);
    });
    it('should return false when score does not match', () => {
        expect((0, scoreCalculator_1.isCheckout)(40, 20, 2)).toBe(false);
    });
    it('should return true for D1 checkout', () => {
        expect((0, scoreCalculator_1.isCheckout)(2, 2, 2)).toBe(true);
    });
    it('should return true for bullseye checkout (D25 = 50)', () => {
        // Bull is treated as double 25 for checkout purposes
        expect((0, scoreCalculator_1.isCheckout)(50, 50, 2)).toBe(true);
    });
});
//# sourceMappingURL=scoreCalculator.test.js.map