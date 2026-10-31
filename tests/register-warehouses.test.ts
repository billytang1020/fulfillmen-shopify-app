import { describe, expect, it } from "vitest";
import {
  ACCOUNT_REGISTER_PATH,
  EXCLUDED_WAREHOUSE_ID,
  HUIZHOU_WAREHOUSE_ID,
  WAREHOUSE_LIST_PATH,
  WAREHOUSE_STYLE,
  buildRegisterWarehouseFields,
  defaultSelectedWarehouseIds,
  getRegisterDefaultWarehouseId,
  mergeRegisterWarehouseFields,
  parseWarehouseListResponse,
  registerWarehouseFieldsFromForm,
  resolveDefaultWarehouseId,
  resolveSelectedWarehouseIds,
  selectOptionalWarehouses,
  type WarehouseListItem,
} from "../app/wms/register-warehouses";
import { shapeAccountRegisterBody } from "../app/wms/account-register.server";

const shenzhen: WarehouseListItem = {
  id: "101",
  name: "Shenzhen",
  style: 4,
  voided: false,
};
const huizhou: WarehouseListItem = {
  id: HUIZHOU_WAREHOUSE_ID,
  name: "Huizhou",
  style: 4,
  voided: false,
};
const huizhou3fl: WarehouseListItem = {
  id: EXCLUDED_WAREHOUSE_ID,
  name: "HuiZhou3FL",
  style: 4,
  voided: false,
};

function formOf(pairs: Array<[string, string]>): Pick<FormData, "get" | "getAll"> {
  const data = new FormData();
  for (const [k, v] of pairs) data.append(k, v);
  return data;
}

describe("config default warehouse", () => {
  it("defaults to Huizhou 536 when env is empty", () => {
    expect(getRegisterDefaultWarehouseId({})).toBe("536");
  });

  it("reads ShopifyApp_RegisterDefaultWarehouseId without inventing another key", () => {
    expect(
      getRegisterDefaultWarehouseId({ ShopifyApp_RegisterDefaultWarehouseId: "777" }),
    ).toBe("777");
  });

  it("reads the Node-style env alias", () => {
    expect(
      getRegisterDefaultWarehouseId({ SHOPIFY_APP_REGISTER_DEFAULT_WAREHOUSE_ID: "888" }),
    ).toBe("888");
  });
});

describe("warehouse list parsing + Style=4 filter", () => {
  it("reads Base_StyleInfoID and keeps Style=4, drops 589 and voided", () => {
    const parsed = parseWarehouseListResponse({
      data: [
        { Base_StyleInfoID: 536, Style: 4, Name: "Huizhou" },
        { Base_StyleInfoID: 589, Style: 4, Name: "HuiZhou3FL" },
        { Base_StyleInfoID: 101, Style: 4, Name: "Shenzhen" },
        { Base_StyleInfoID: 200, Style: 8, Name: "Shop" },
        { Base_StyleInfoID: 300, Style: 4, Name: "Dead", IsVoid: true },
      ],
    });
    expect(parsed.map((w) => w.id)).toEqual(["536", "589", "101", "200", "300"]);
    expect(selectOptionalWarehouses(parsed).map((w) => w.id)).toEqual(["536", "101"]);
  });

  it("does not invent an alternate id field when Base_StyleInfoID is missing", () => {
    const parsed = parseWarehouseListResponse({
      data: [{ id: 536, Style: 4, Name: "Huizhou" }],
    });
    expect(parsed).toEqual([]);
  });

  it("unwraps nested data.list rows", () => {
    const parsed = parseWarehouseListResponse({
      Data: { List: [{ Base_StyleInfoID: "536", style: "4", Name: "Huizhou" }] },
    });
    expect(selectOptionalWarehouses(parsed)).toHaveLength(1);
    expect(selectOptionalWarehouses(parsed)[0]?.id).toBe("536");
  });
});

describe("Settings default Huizhou selection", () => {
  it("default-checks Huizhou 536 even when other Style=4 warehouses exist", () => {
    expect(defaultSelectedWarehouseIds([shenzhen, huizhou, huizhou3fl])).toEqual(["536"]);
  });

  it("still default-checks 536 when the list has not arrived yet", () => {
    expect(defaultSelectedWarehouseIds([])).toEqual(["536"]);
  });

  it("uses persisted picks instead of re-defaulting Huizhou", () => {
    expect(
      resolveSelectedWarehouseIds({
        optional: [shenzhen, huizhou],
        persistedIds: ["101"],
      }),
    ).toEqual(["101"]);
  });

  it("ignores persisted 589", () => {
    expect(
      resolveSelectedWarehouseIds({
        optional: [shenzhen, huizhou],
        persistedIds: ["589", "101"],
      }),
    ).toEqual(["101"]);
  });

  it("picks Huizhou as defaultWarehouseId when it is selected", () => {
    expect(
      resolveDefaultWarehouseId({
        warehouseIds: ["101", "536"],
        persistedDefaultId: null,
      }),
    ).toBe("536");
  });

  it("keeps a persisted default when it is still selected", () => {
    expect(
      resolveDefaultWarehouseId({
        warehouseIds: ["101", "536"],
        persistedDefaultId: "101",
      }),
    ).toBe("101");
  });
});

describe("Register payload shape (Anders contract)", () => {
  it("uses exact field names warehouseIds + defaultWarehouseId as strings", () => {
    const payload = buildRegisterWarehouseFields({
      warehouseIds: [536, 101],
      defaultWarehouseId: 536,
    });
    expect(Object.keys(payload).sort()).toEqual(["defaultWarehouseId", "warehouseIds"]);
    expect(payload).toEqual({
      warehouseIds: ["536", "101"],
      defaultWarehouseId: "536",
    });
  });

  it("empty / missing warehouseIds → [默认惠州 536]", () => {
    expect(buildRegisterWarehouseFields({})).toEqual({
      warehouseIds: ["536"],
      defaultWarehouseId: "536",
    });
    expect(buildRegisterWarehouseFields({ warehouseIds: [] })).toEqual({
      warehouseIds: ["536"],
      defaultWarehouseId: "536",
    });
    expect(buildRegisterWarehouseFields({ warehouseIds: null })).toEqual({
      warehouseIds: ["536"],
      defaultWarehouseId: "536",
    });
  });

  it("defaultWarehouseId 缺省 → warehouseIds[0]", () => {
    expect(buildRegisterWarehouseFields({ warehouseIds: ["101", "202"] })).toEqual({
      warehouseIds: ["101", "202"],
      defaultWarehouseId: "101",
    });
  });

  it("drops excluded 589 from the register payload", () => {
    expect(
      buildRegisterWarehouseFields({
        warehouseIds: ["589", "101"],
        defaultWarehouseId: "589",
      }),
    ).toEqual({
      warehouseIds: ["101"],
      defaultWarehouseId: "101",
    });
  });

  it("if defaultWarehouseId is not in warehouseIds, falls back to warehouseIds[0]", () => {
    expect(
      buildRegisterWarehouseFields({
        warehouseIds: ["101"],
        defaultWarehouseId: "536",
      }),
    ).toEqual({
      warehouseIds: ["101"],
      defaultWarehouseId: "101",
    });
  });

  it("merges onto an existing register body without renaming other fields", () => {
    const body = mergeRegisterWarehouseFields(
      { shopDomain: "demo.myshopify.com", shopName: "Demo" },
      { warehouseIds: ["536", "101"] },
    );
    expect(body.shopDomain).toBe("demo.myshopify.com");
    expect(body.shopName).toBe("Demo");
    expect(body.warehouseIds).toEqual(["536", "101"]);
    expect(body.defaultWarehouseId).toBe("536");
  });

  it("account-register path shapes the same two fields", () => {
    const body = shapeAccountRegisterBody(
      { email: "ops@example.com" },
      { warehouseIds: ["101"], defaultWarehouseId: "101" },
    );
    expect(body).toEqual({
      email: "ops@example.com",
      warehouseIds: ["101"],
      defaultWarehouseId: "101",
    });
  });

  it("form checkbox/radio names match the Anders fields", () => {
    const payload = registerWarehouseFieldsFromForm(
      formOf([
        ["warehouseIds", "536"],
        ["warehouseIds", "101"],
        ["defaultWarehouseId", "536"],
      ]),
    );
    expect(payload).toEqual({
      warehouseIds: ["536", "101"],
      defaultWarehouseId: "536",
    });
  });

  it("empty form still registers default Huizhou", () => {
    expect(registerWarehouseFieldsFromForm(formOf([]))).toEqual({
      warehouseIds: ["536"],
      defaultWarehouseId: "536",
    });
  });

  it("keeps Anders paths and does not invent a new list/register route", () => {
    expect(WAREHOUSE_LIST_PATH).toBe("/openapi/alibaba/warehouse/list");
    expect(ACCOUNT_REGISTER_PATH).toBe("account/register");
    expect(WAREHOUSE_STYLE).toBe(4);
    expect(HUIZHOU_WAREHOUSE_ID).toBe("536");
    expect(EXCLUDED_WAREHOUSE_ID).toBe("589");
  });
});
