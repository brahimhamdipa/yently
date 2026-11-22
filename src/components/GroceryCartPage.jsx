import { useCart } from '../lib/CartContext'
import { GroceryTopBar } from './GroceryMenu'
import CartCheckout from './CartCheckout'

// My Cart page — the exact same cart/checkout as the "Your cart" section on
// the Groceries shop page (shared CartCheckout component + shared cart).
// The old grocery_products catalog is retired: the cart holds store items
// and bags only, so CartCheckout gets an empty grocery list.
export default function GroceryCartPage({ go }) {
  const { count, lastOrder } = useCart()

  return (
    <div>
      <GroceryTopBar go={go} />
      <div className="hero-card">
        <h2>🛒 My Cart</h2>
        <p>Everything you've added from anywhere on the site is here, grouped by store. Each store's order is placed separately — choose delivery or pickup per store, send your orders, and we'll take it from there.</p>
      </div>
      {count === 0 && (!lastOrder || lastOrder.length === 0) && (
        <div className="hero-card">
          <p>Your cart is empty.</p>
          <button onClick={() => go && go('products')}>Browse Products</button>
        </div>
      )}
      {(count > 0 || (lastOrder && lastOrder.length > 0)) && (
        <CartCheckout products={[]} onOrderPlaced={() => {}} />
      )}
    </div>
  )
}
