import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { create } from "@bufbuild/protobuf";
import {
  GetOrdersResponse_ShopSchema,
  UserProductSchema,
  UserProductType,
} from "../gen/proto/public/v1/public_api_pb";
import { readUrlSearchParams } from "./hooks/useUrlSearchParams";
import {
  productsOfShop,
  selectedShop,
  shopsOfOrders,
  shopsOfProducts,
} from "./shop-filter";

describe("shop-filter helpers", () => {
  it("builds shops from products, drops empty project ids, and counts per shop", () => {
    const products = [
      create(UserProductSchema, {
        projectId: "shopA",
        projectName: "Sklep A",
        accessId: "a1",
        productName: "Ebook 1",
        productType: UserProductType.FILE,
        projectTheme: {
          imageUrl: "https://cdn.test/a-light.png",
          imageDarkUrl: "https://cdn.test/a-dark.png",
        },
      }),
      create(UserProductSchema, {
        projectId: "",
        projectName: "Orphan",
        accessId: "x1",
        productName: "No shop",
        productType: UserProductType.FILE,
      }),
      create(UserProductSchema, {
        projectId: "shopB",
        projectName: "",
        accessId: "b1",
        productName: "Kurs",
        productType: UserProductType.COURSE,
      }),
      create(UserProductSchema, {
        projectId: "shopA",
        projectName: "Sklep A",
        accessId: "a2",
        productName: "Ebook 2",
        productType: UserProductType.FILE,
      }),
    ];

    const shops = shopsOfProducts(products, "Sklep");
    assert.deepEqual(shops, [
      {
        projectId: "shopA",
        name: "Sklep A",
        imageUrl: "https://cdn.test/a-light.png",
        imageDarkUrl: "https://cdn.test/a-dark.png",
        count: 2,
      },
      {
        projectId: "shopB",
        name: "Sklep",
        imageUrl: undefined,
        imageDarkUrl: undefined,
        count: 1,
      },
    ]);
    assert.deepEqual(
      productsOfShop(products, "shopA").map((p) => p.accessId),
      ["a1", "x1", "a2"],
    );
  });

  it("builds shops from GetOrdersResponse.shops and tolerates missing/empty fields", () => {
    assert.deepEqual(shopsOfOrders(undefined), []);
    assert.deepEqual(shopsOfOrders([]), []);

    const shops = shopsOfOrders(
      [
        create(GetOrdersResponse_ShopSchema, {
          projectId: "shop2",
          name: "Drugi",
          imageUrl: "https://cdn.test/2.png",
          orderCount: 4,
        }),
        create(GetOrdersResponse_ShopSchema, {
          projectId: "",
          name: "Ignored",
          orderCount: 1,
        }),
        create(GetOrdersResponse_ShopSchema, {
          projectId: "shop1",
          name: "",
          imageDarkUrl: "https://cdn.test/1-dark.png",
          orderCount: 2,
        }),
      ],
      "Sklep",
    );
    assert.deepEqual(shops, [
      {
        projectId: "shop2",
        name: "Drugi",
        imageUrl: "https://cdn.test/2.png",
        imageDarkUrl: undefined,
        count: 4,
      },
      {
        projectId: "shop1",
        name: "Sklep",
        imageUrl: undefined,
        imageDarkUrl: "https://cdn.test/1-dark.png",
        count: 2,
      },
    ]);
  });

  it("resolves selectedShop only when 2+ shops exist and param matches one", () => {
    const one = [{ projectId: "only", name: "Jedyny", count: 3 }];
    const two = [
      { projectId: "1e5", name: "Sklep A", count: 2 },
      { projectId: "shopB", name: "Sklep B", count: 1 },
    ];

    assert.equal(selectedShop([], "1e5"), undefined);
    assert.equal(selectedShop(one, "only"), undefined);
    assert.equal(selectedShop(two, undefined), undefined);
    assert.equal(selectedShop(two, ""), undefined);
    assert.equal(selectedShop(two, "unknown"), undefined);
    assert.equal(selectedShop(two, "1e5"), "1e5");
    assert.equal(selectedShop(two, "shopB"), "shopB");
  });

  it("reads shop and orderProject as raw strings even for numeric-looking values like 1e5", () => {
    const initial = {
      state: "orders",
      shop: undefined as string | undefined,
      orderProject: undefined as string | undefined,
    };

    const raw = readUrlSearchParams(
      "?state=%22orders%22&shop=1e5&orderProject=12345",
      initial,
      ["shop", "orderProject"],
    );
    assert.equal(raw.shop, "1e5");
    assert.equal(typeof raw.shop, "string");
    assert.equal(raw.orderProject, "12345");
    assert.equal(typeof raw.orderProject, "string");

    const quoted = readUrlSearchParams(
      `?shop=${encodeURIComponent(JSON.stringify("1e5"))}&orderProject=${encodeURIComponent(JSON.stringify("true"))}`,
      initial,
      ["shop", "orderProject"],
    );
    assert.equal(quoted.shop, "1e5");
    assert.equal(quoted.orderProject, "true");

    const boolLike = readUrlSearchParams(
      "?shop=true&orderProject=null",
      initial,
      ["shop", "orderProject"],
    );
    assert.equal(boolLike.shop, "true");
    assert.equal(boolLike.orderProject, "null");
  });
});
