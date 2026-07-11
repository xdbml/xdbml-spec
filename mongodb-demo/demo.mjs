import { simplifiedSchemaToXdbml } from "./simplified-schema-to-xdbml.mjs";

// Exactly the shape returned by the MongoDB MCP server's collection-schema
// tool: JSON.stringify({ database, collection, schema }) where schema is a
// mongodb-schema SimplifiedSchema (types ordered most-frequent-first).

const customers = {
  database: "shop",
  collection: "customers",
  schema: {
    _id: { types: [{ bsonType: "ObjectId" }] },
    email: { types: [{ bsonType: "String" }] },
    name: { types: [{ bsonType: "String" }] },
    loyalty_tier: { types: [{ bsonType: "String" }, { bsonType: "Null" }] },
    address: {
      types: [
        {
          bsonType: "Document",
          fields: {
            street: { types: [{ bsonType: "String" }] },
            city: { types: [{ bsonType: "String" }] },
            country: { types: [{ bsonType: "String" }] },
            zip: { types: [{ bsonType: "String" }, { bsonType: "Int32" }] },
          },
        },
      ],
    },
    tags: { types: [{ bsonType: "Array", types: [{ bsonType: "String" }] }] },
    created_at: { types: [{ bsonType: "Date" }] },
  },
};

const orders = {
  database: "shop",
  collection: "orders",
  schema: {
    _id: { types: [{ bsonType: "ObjectId" }] },
    customer_id: { types: [{ bsonType: "ObjectId" }] },
    // schema drift: totals stored as Double historically, Decimal128 now
    total: { types: [{ bsonType: "Decimal128" }, { bsonType: "Double" }] },
    status: { types: [{ bsonType: "String" }] },
    // app v1 stored a bare method string, v2 stores a subdocument
    payment: {
      types: [
        {
          bsonType: "Document",
          fields: {
            method: { types: [{ bsonType: "String" }] },
            last4: { types: [{ bsonType: "String" }] },
            captured: { types: [{ bsonType: "Boolean" }] },
          },
        },
        { bsonType: "String" },
      ],
    },
    line_items: {
      types: [
        {
          bsonType: "Array",
          types: [
            {
              bsonType: "Document",
              fields: {
                sku: { types: [{ bsonType: "String" }] },
                qty: { types: [{ bsonType: "Int32" }] },
                unit_price: { types: [{ bsonType: "Decimal128" }] },
                discount: {
                  types: [{ bsonType: "Double" }, { bsonType: "Undefined" }],
                },
              },
            },
          ],
        },
      ],
    },
    placed_at: { types: [{ bsonType: "Date" }] },
    notes: { types: [{ bsonType: "Undefined" }, { bsonType: "String" }] },
  },
};

const xdbml = simplifiedSchemaToXdbml([customers, orders], {
  sampleSize: 50,
  // supplied by the agent, e.g. from $lookup analysis or ObjectId naming
  refs: [
    {
      from: "shop.orders.customer_id",
      to: "shop.customers._id",
      source: "0..*",
      target: "1..1",
    },
  ],
});

console.log(xdbml);
