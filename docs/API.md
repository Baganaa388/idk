# Aktar Marka — API гэрээ

Бүх хариу JSON. Алдаа: `{ "error": "Монгол мессеж" }` + HTTP статус (400/401/403/404/409/429/5xx).
Нэвтрэлт cookie-д (HttpOnly): хэрэглэгч `usid`, админ `asid`. Fetch хийхдээ `credentials: 'same-origin'` (анхдагч).
Мөнгө бүхэл төгрөг (integer). Огноо `'YYYY-MM-DD HH:MM:SS'` (Улаанбаатарын цаг).
401 + `code: "AUTH_REQUIRED"` → хэрэглэгчийг `/login?next=<одоогийн зам>` руу шилжүүлнэ.

## Объектууд

**Product** (жагсаалтад `images: []`, `image` = нүүр зураг; дэлгэрэнгүйд `images: [{id,url,sort}]`):
```
{ id, sku, slug, name, brand, category_id, category_name, category_slug, price, compare_price, stock,
  low_stock_threshold, volume, short_desc, description, benefits: [string], usage: [string],
  is_active, is_featured, image, images, in_stock, low_stock, sold (зөвхөн жагсаалтад), created_at, updated_at }
```
**Category tree node**: `{ id, parent_id, name, slug, sort, is_active, product_count, total_count, children: [node] }`

**Loyalty status**:
```
{ paid_orders, next_order_seq, enabled,
  tier: { min_order, pct, name, index, next: { min_order, pct, name, orders_left } | null },
  tiers: [{ min_order, pct, name }] }
```
Хямдрал = дараагийн захиалгын дугаар (`next_order_seq` = төлөгдсөн захиалгын тоо + 1)-т харгалзах шатны `pct`.
Анхдагч: 1-р 0%, 2-р 10%, 3-р ба цаашид 20% (админаас өөрчилнө).

**Cart**:
```
{ items: [{ product_id, name, slug, sku, image, volume, price, compare_price, qty, stock, available, line_total }],
  count, subtotal, discount_pct, discount_amount, shipping_fee, free_shipping_over, total, loyalty: LoyaltyStatus }
```

**Order**:
```
{ id, order_no, user_id, status, status_label, payment_status, payment_status_label, payment_method,
  order_seq, subtotal, discount_pct, discount_amount, shipping_fee, total, customer_name, phone, address, note,
  created_at, updated_at, paid_at, cancelled_at, cancel_reason,
  // дэлгэрэнгүйд:
  items: [{ id, product_id, sku, name, image, price, qty, line_total }],
  history: [{ id, kind: 'status'|'payment', from_value, to_value, actor, note, created_at }],
  payment: Payment | null, refund_required: bool }
```
status: `pending` (Хүлээгдэж буй) → `processing` (Бэлтгэгдэж буй) → `shipped` (Илгээгдсэн) → `delivered` (Хүргэгдсэн); `cancelled` (Цуцлагдсан).
payment_status: `pending` (Хүлээгдэж буй) | `paid` (Төлөгдсөн) | `cancelled` (Цуцлагдсан).

**Payment** (QPay нэхэмжлэх):
```
{ id, provider: 'qpay', mode: 'live'|'mock', invoice_id, amount, status: 'pending'|'paid'|'cancelled'|'expired',
  qr_image: 'data:image/png;base64,...', qr_text, short_url,
  deeplinks: [{ name, description, logo, link }],   // банк / зээлийн апп руу шууд нээх холбоос
  created_at, expires_at, paid_at, paid_amount }
```

---

## Дэлгүүр (нэвтрэлтгүй)

| Method | Path | Тайлбар |
|---|---|---|
| GET | `/api/store/site` | `{ business, delivery, home:{banners:[{image,link,title}], featured_title}, loyalty:{enabled,tiers}, categories: tree, brands:[{brand,n}], payment_mode }` |
| GET | `/api/store/categories` | `{ categories: tree }` |
| GET | `/api/store/products` | query: `category` (slug, дэд категорийг багтаана), `q`, `brand`, `min`, `max`, `sort` (`new`\|`price_asc`\|`price_desc`\|`popular`\|`name`), `page`, `limit` (≤100, анхдагч 24), `featured=1` → `{ items, total, page, pages, limit }` |
| GET | `/api/store/products/:slug` | `{ product, related: [Product] }` |

`business`: `{ name, tagline, phones:[], email, hours, address, address_note, facebook, instagram }`
`delivery`: `{ fee, free_over, note }`

## Бүртгэл / нэвтрэлт — `/api/account`

| Method | Path | Body | Хариу |
|---|---|---|---|
| POST | `/register` | `{ identifier (и-мэйл эсвэл 8 оронтой утас), password (≥8), name }` | 201 `{ user }` + cookie |
| POST | `/login` | `{ identifier, password }` | `{ user }` |
| POST | `/otp/request` | `{ identifier }` | `{ sent, channel, is_new, ttl_minutes, resend_seconds, dev_code? }` |
| POST | `/otp/verify` | `{ identifier, code, name? }` (бүртгэлгүй бол автоматаар бүртгэнэ) | `{ user }` |
| POST | `/logout` | — | `{ ok }` |
| GET | `/me` | — | `{ user, loyalty }` эсвэл 401 |
| PATCH | `/me` | `{ name?, address?, email?, phone? }` | `{ user }` |
| POST | `/password` | `{ current_password?, new_password }` (OTP-оор бүртгүүлсэн, нууц үггүй бол current шаардахгүй) | `{ ok }` |

`user`: `{ id, name, email, phone, address, verified, has_password, created_at }`

## Сагс — `/api/cart` (нэвтрэх шаардлагатай)

| Method | Path | Body | Хариу |
|---|---|---|---|
| GET | `/api/cart` | — | Cart |
| POST | `/api/cart/items` | `{ product_id, qty=1 }` (одоогийн дээр нэмнэ) | Cart |
| PATCH | `/api/cart/items/:productId` | `{ qty }` (0 → устгана) | Cart |
| DELETE | `/api/cart/items/:productId` | — | Cart |
| DELETE | `/api/cart` | — | хоосон Cart |

Үлдэгдэл хүрэлцэхгүй бол 409.

## Захиалга — `/api/orders` (нэвтрэх шаардлагатай)

| Method | Path | Body | Хариу |
|---|---|---|---|
| GET | `/api/orders` | — | `{ orders: [Order + items:[{name,image,qty}]], loyalty }` |
| POST | `/api/orders` | `{ name, phone (8 орон), address (≥5), note? }` — сагснаас үүсгэнэ, сагс хоосорно | 201 `{ order, payment \| null, payment_error \| null }` |
| GET | `/api/orders/:orderNo` | — | `{ order }` |
| POST | `/api/orders/:orderNo/pay` | — | `{ order, payment }` (хугацаа дууссан бол шинэ нэхэмжлэх) |
| POST | `/api/orders/:orderNo/check` | — | `{ order }` — QPay-тэй синк. Төлбөрийн хуудас 4 секунд тутамд дуудна |
| POST | `/api/orders/:orderNo/cancel` | — | `{ order }` (зөвхөн төлөгдөөгүй pending) |

Төлбөрийн хугацаа (анхдагч 30 мин) дуусахад захиалга автоматаар `cancelled` болж үлдэгдэл буцна.

## Төлбөр — mock горим (`payment_mode === 'mock'`)

| Method | Path | Хариу |
|---|---|---|
| GET | `/api/payments/mock/:invoiceId` | `{ invoice_id, order_no, amount, status, mock_paid }` |
| POST | `/api/payments/mock/:invoiceId/pay` | `{ ok, order_no, payment_status }` |

Mock горимд QR код ба deeplink бүгд `/pay/mock/:invoiceId` хуудас руу заана — тэр хуудас "Төлбөр хийх (туршилт)" товчтой.
`/api/payments/qpay/callback` — QPay-ийн сервер дуудна (frontend ашиглахгүй).

---

## Админ — `/api/admin` (`/login`-оос бусад нь админ cookie шаардана)

### Нэвтрэлт
- POST `/login` `{ username, password }` → `{ username }`
- POST `/logout`; GET `/me` → `{ username, payment_mode }`
- POST `/password` `{ current_password, new_password }`

### Хяналтын самбар
GET `/dashboard` →
```
{ today:{orders,revenue}, month:{orders,revenue},
  counts:{ to_process (төлөгдсөн, pending), awaiting_payment, processing, shipped },
  low_stock:[{id,sku,name,stock,low_stock_threshold,image}], low_stock_count,
  recent_orders:[{id,order_no,customer_name,total,status,payment_status,created_at}],
  customers, new_customers_month, products,
  sales_30d: SalesReport, top_products: [TopProduct], retention: Retention }
```

### Категори
- GET `/categories` → `{ categories: [flat {id,parent_id,name,slug,sort,is_active,product_count,child_count}], tree }`
- POST `/categories` `{ name, slug?, parent_id?, sort?, is_active? }` → 201 `{ category }`
- PUT `/categories/:id` (ижил body) → `{ category }`
- DELETE `/categories/:id` (дэд категори/бараатай бол 409)

### Бараа
- GET `/products` query: `q, category (id эсвэл slug), status (active|inactive), stock (low|out|alert), sort (new|name|price_asc|price_desc|stock|popular), page, limit, brand` → `{ items, total, page, pages }`
- GET `/products/:id` (query `from`, `to` — анхдагч сүүлийн 30 хоног) → `{ product, movements:[StockMovement], sold:{qty,revenue}, sales_series:[{key:'YYYY-MM-DD', qty, revenue}] }`
- POST `/products` `{ sku, name, price, stock (анхны үлдэгдэл), category_id, brand, compare_price, low_stock_threshold, volume, short_desc, description, benefits:[string], usage:[string], is_active, is_featured, slug?, image_urls?:[string] }` → 201 `{ product }`
- PUT `/products/:id` (stock-оос бусад ижил талбар; үлдэгдлийг агуулахын хөдөлгөөнөөр өөрчилнө) → `{ product }`
- DELETE `/products/:id` → `{ ok, deleted }` эсвэл захиалгатай бол `{ ok, archived, message }` (идэвхгүй болгоно)
- POST `/products/:id/images` multipart `images` (олон файл, ≤10, ≤8MB) → 201 `{ images }`
- PUT `/products/:id/images/order` `{ ids:[imageId] }` → `{ images }` (эхнийх нь нүүр зураг)
- DELETE `/products/:id/images/:imageId` → `{ images }`
- POST `/uploads` multipart `image` → 201 `{ url }` (баннер г.м.)

### Агуулах
- GET `/inventory` → `{ alerts:[{id,sku,name,stock,low_stock_threshold,is_active,image}], totals:{products,units,stock_value}, out_of_stock }`
- POST `/products/:id/stock` `{ type: 'in'|'out', qty, reason? }` эсвэл `{ type:'adjust', stock (тоолсон бодит үлдэгдэл), reason? }` → `{ stock, product }`
- GET `/stock-movements` query: `product_id, type, from, to, page, limit` → `{ items:[{id,product_id,product_name,sku,change,stock_after,type,reason,order_id,order_no,created_by,created_at}], total, page, pages }`
  type: `initial` Анхны, `in` Орлого, `out` Зарлага, `adjust` Тооллого, `order` Захиалга, `cancel` Цуцлалт, `import` Импорт

### Bulk импорт
- GET `/import/template.csv`, GET `/import/template.xlsx` (файл татах)
- POST `/import/preview` multipart `file` (.csv/.xlsx) → `{ rows:[{ line, action:'create'|'update'|'error', errors:[string], data:{sku,name,price,stock,category_id,category_name,brand,...,benefits:[],usage:[],images:[]}, current_stock }], errors:[string], summary:{total,create,update,error} }`
- POST `/import/commit` `{ rows }` (preview-ийн rows-ийг буцааж илгээнэ; сервер дахин шалгана) → `{ created, updated, skipped, errors }`

### Захиалга
- GET `/orders` query: `status, payment_status, q, from, to, user_id, page, limit` → `{ items:[Order + user_email,user_phone,units], total, page, pages, counts:{status:n} }`
- GET `/orders/export.csv` (ижил шүүлтүүр)
- GET `/orders/:id` → `{ order (дэлгэрэнгүй), customer:{id,name,email,phone,created_at}, loyalty }`
- PATCH `/orders/:id/status` `{ status, note? }` → `{ order }` (урагш л шилжинэ; pending-ээс цааш төлөгдсөн байх ёстой; `cancelled` → үлдэгдэл буцна)
- POST `/orders/:id/sync-payment` → `{ order }` (QPay-тэй гараар синк)

### Хэрэглэгч
- GET `/customers` query: `q, sort (new|spent|orders|last), page, limit` → `{ items:[{id,name,email,phone,verified,is_blocked,created_at,last_login_at,orders_count,paid_orders,total_spent,last_order_at,next_order_seq,tier:{min_order,pct,name,index,next}}], total, page, pages, tiers }`
- GET `/customers/:id` → `{ customer, orders:[Order], products:[{name,sku,qty,revenue}], loyalty }`
- PATCH `/customers/:id` `{ name?, is_blocked? }`

### Анализ (зөвхөн төлөгдсөн, цуцлагдаагүй захиалга, `paid_at` огноогоор)
- GET `/analytics/sales` query: `period (day|week|month), from, to` → SalesReport `{ period, from, to, series:[{key, orders, revenue, discounts, gross, units}], totals:{orders,revenue,discounts,gross,units,avg_order} }` (key: өдөр `YYYY-MM-DD`, долоо хоног = Даваа гарагийн огноо, сар `YYYY-MM`)
- GET `/analytics/sales.csv` (ижил query)
- GET `/analytics/top-products` query: `from, to, limit` → `{ from, to, items:[{product_id,name,sku,image,qty,revenue,orders}] }`
- GET `/analytics/retention` query: `from, to` → `{ from, to, buyers, repeat_buyers, retention_rate (%), distribution:{1,2,'3+'}, cohorts:[{month,customers,returned,rate}] }`

### Тохиргоо
- GET `/settings` → `{ business, loyalty:{enabled,tiers:[{min_order,pct,name}]}, delivery:{fee,free_over,note}, payment:{invoice_ttl_minutes}, home:{banners,featured_title}, qpay:{mode,base_url,invoice_code,public_url} }`
- PUT `/settings/:key` (key: business|loyalty|delivery|payment|home) — бүтэн объект → `{ [key]: value }`
