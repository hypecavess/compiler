/**
 * Real-world Example: E-Commerce Business Rule & Discount Engine
 *
 * Demonstrates embedding Fradual in a Node.js backend service to safely evaluate
 * merchant-defined promotion rules without risking server crash or prototype pollution.
 */
import { Fradual } from '../src/index.js';

interface CartItem {
    id: string;
    name: string;
    category: string;
    price: number;
    qty: number;
}

interface OrderContext {
    user: {
        id: string;
        tier: string;
        ordersCount: number;
    };
    cart: {
        items: CartItem[];
        subtotal: number;
        couponCode: string | null;
    };
}

// 1. Host Order Data
const order: OrderContext = {
    user: {
        id: 'usr_8821',
        tier: 'VIP',
        ordersCount: 14,
    },
    cart: {
        items: [
            { id: 'item_1', name: 'Mechanical Keyboard', category: 'electronics', price: 120, qty: 1 },
            { id: 'item_2', name: 'USB-C Cable', category: 'accessories', price: 15, qty: 2 },
        ],
        subtotal: 150,
        couponCode: 'SAVE20',
    },
};

// 2. Merchant-configured untrusted rule script
const merchantRule = `
    var discountPercent = 0;
    var tags = [];

    // VIP users get 10% base discount
    if (order.user.tier == "VIP") {
        discountPercent = discountPercent + 10;
        push(tags, "VIP_LOYALTY");
    }

    // Coupon code validation
    if (order.cart.couponCode == "SAVE20") {
        discountPercent = discountPercent + 20;
        push(tags, "PROMO_SAVE20");
    }

    // Free shipping qualification
    var freeShipping = false;
    if (order.cart.subtotal >= 100) {
        freeShipping = true;
        push(tags, "FREE_SHIPPING");
    }

    var discountAmount = calculateDiscount(order.cart.subtotal, discountPercent);
    var finalTotal = order.cart.subtotal - discountAmount;

    return {
        originalSubtotal: order.cart.subtotal,
        discountPercent: discountPercent,
        discountAmount: discountAmount,
        finalTotal: finalTotal,
        freeShipping: freeShipping,
        appliedTags: tags
    };
`;

// 3. Initialize Sandboxed Engine
const engine = new Fradual({
    maxInstructions: 25_000,
    maxExecutionMs: 500,
    globals: { order },
    natives: {
        calculateDiscount: (subtotal: number, percent: number) => {
            return (subtotal * percent) / 100;
        },
    },
});

console.log('Evaluating merchant promotion rule in Fradual sandbox...');
const result = engine.run(merchantRule);

if (result.ok) {
    console.log('Rule evaluation succeeded! Result:');
    console.dir(result.value, { depth: null });
} else {
    console.error('Rule execution failed:', result.diagnostics);
}
