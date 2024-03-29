import { OrderLineItem, Money, OrderLineItemModifier, Order, CatalogObject, CatalogIdMapping, OrderFulfillment, CatalogItemModifierListInfo, OrderLineItemDiscount } from 'square';
import logger from '../logging';
import { CatalogProviderInstance } from './catalog_provider';
import { IMoney, TenderBaseStatus, PRODUCT_LOCATION, IProduct, IProductInstance, KeyValue, ICatalogSelectors, OptionPlacement, OptionQualifier, IOption, IOptionInstance, PrinterGroup, CURRENCY, CoreCartEntry, WProduct, OrderLineDiscount, OrderTax, DiscountMethod, IOptionType, ICatalog, WCPProductV2Dto, ProductModifierEntry, CartByPrinterGroup } from '@wcp/wcpshared';
import { formatRFC3339 } from 'date-fns';
import { IS_PRODUCTION } from '../utils';

// TODOS FOR TODAY: 
// * add versioning to mongoose?
// * add note to payment or whatever so the SQ receipt makes some sense, see https://squareup.com/receipt/preview/jXnAjUa3wdk6al0EofHUg8PUZzFZY 
export const SQUARE_TAX_RATE_CATALOG_ID = IS_PRODUCTION ? "TMG7E3E5E45OXHJTBOHG2PMS" : "LOFKVY5UC3SLKPT2WANSBPZQ";
export const SQUARE_WARIO_EXTERNAL_ID = IS_PRODUCTION ? 'L75RYR2NI3ED7VM7VKXO2DKO' : 'NDV2QHR54XWVXCKOHXK43ZLE';
export const SQUARE_BANKERS_ADJUSTED_TAX_RATE_CATALOG_ID = IS_PRODUCTION ? "R77FWA4SNHB4RWNY4KNNQHJD" : "HIUHEOWWVR6MB3PP7ORCUVZW"
export const VARIABLE_PRICE_STORE_CREDIT_CATALOG_ID = IS_PRODUCTION ? "DNP5YT6QDIWTB53H46F3ECIN" : "RBYUD52HGFHPL4IG55LBHQAG";
export const DISCOUNT_CATALOG_ID = IS_PRODUCTION ? "AKIYDPB5WJD2HURCWWZSAIF5" : 'PAMEV3WAZYEBJKFUAVQATS3K'

export const WARIO_SQUARE_ID_METADATA_KEY = 'SQID_';

export const BigIntMoneyToIntMoney = (bigIntMoney: Money): IMoney => ({ amount: Number(bigIntMoney.amount!), currency: bigIntMoney.currency! });

export const IMoneyToBigIntMoney = (money: IMoney): Money => ({ amount: BigInt(money.amount), currency: money.currency });

export const GetSquareExternalIds = (externalIds: KeyValue[] | undefined) => (externalIds ?? []).filter(x => x.key.startsWith(WARIO_SQUARE_ID_METADATA_KEY));
export const GetNonSquareExternalIds = (externalIds: KeyValue[] | undefined) => (externalIds ?? []).filter(x => !x.key.startsWith(WARIO_SQUARE_ID_METADATA_KEY));

export const GetSquareIdIndexFromExternalIds = (externalIds: KeyValue[] | undefined, specifier: string) =>
  (externalIds ?? []).findIndex(x => x.key === `${WARIO_SQUARE_ID_METADATA_KEY}${specifier}`);
export const GetSquareIdFromExternalIds = (externalIds: KeyValue[], specifier: string): string | null => {
  const kvIdx = GetSquareIdIndexFromExternalIds(externalIds, specifier);
  return kvIdx === -1 ? null : externalIds[kvIdx].value;
}
export interface SquareOrderFulfillmentInfo {
  displayName: string;
  emailAddress: string;
  phoneNumber: string;
  pickupAt: Date | number;
  note?: string;
};

/**
 * Generates a mapping from Square Catalog Object ID to WARIO ID.
 * Multiple square objects might map to the same WARIO ID due to feature emulation
 * @param catalog 
 * @returns mapping from Square Catalog Object ID to WARIO ID
 */
export const GenerateSquareReverseMapping = (catalog: ICatalog): Record<string, string> => {
  const acc: Record<string, string> = {};
  Object.values(catalog.modifiers).forEach(modEntry => {
    if (modEntry.options.length >= 1) {
      GetSquareExternalIds(modEntry.modifierType.externalIDs)
        .forEach(kv => {
          acc[kv.value] = modEntry.modifierType.id;
        });
      modEntry.options.forEach(oId => {
        GetSquareExternalIds(catalog.options[oId]!.externalIDs)
          .forEach(kv => {
            acc[kv.value] = oId;
          });
      })
    }
  })
  Object.values(catalog.products).forEach(productEntry => {
    productEntry.instances.forEach(pIId => {
      GetSquareExternalIds(catalog.productInstances[pIId]!.externalIDs)
        .forEach(kv => {
          acc[kv.value] = pIId;
        });
    });
  });
  return acc;
}

export const LineItemsToOrderInstanceCart = (lineItems: OrderLineItem[]): CoreCartEntry<WCPProductV2Dto>[] => {
  try {
    return lineItems
      .filter(line => line.itemType === 'ITEM')
      .map((line) => {
        const pIId = CatalogProviderInstance.ReverseMappings[line.catalogObjectId!];
        if (!pIId) {
          logger.error(`Unable to find matching product instance ID for square item variation`);
        }
        const warioProductInstance = CatalogProviderInstance.Catalog.productInstances[pIId]!;
        const warioProduct = CatalogProviderInstance.Catalog.products[warioProductInstance.productId].product;
        const modifiers: ProductModifierEntry[] = Object.values((line.modifiers ?? [])
          .reduce((acc: Record<string, ProductModifierEntry>, lineMod) => {
            const oId = CatalogProviderInstance.ReverseMappings[lineMod.catalogObjectId!];
            const warioModifierOption = CatalogProviderInstance.Catalog.options[oId];
            const mTId = warioModifierOption.modifierTypeId;
            return { ...acc, [mTId]: { modifierTypeId: mTId, options: [{ optionId: oId, placement: OptionPlacement.WHOLE, qualifier: OptionQualifier.REGULAR }, ...(acc[mTId]?.options ?? [])] } };
          }, {}))
          // now sort it...
          .sort((a, b) => CatalogProviderInstance.Catalog.modifiers[a.modifierTypeId].modifierType.ordinal - CatalogProviderInstance.Catalog.modifiers[b.modifierTypeId].modifierType.ordinal)
          .map(x => ({ ...x, options: x.options.sort((a, b) => CatalogProviderInstance.Catalog.options[a.optionId].ordinal - CatalogProviderInstance.Catalog.options[b.optionId].ordinal) }))
        // PRECONDITION: 3p products are unique to the 3p merchant and shouldn't yield a category outside of the 3p menu tree
        const category = warioProduct.category_ids[0];
        return {
          categoryId: category,
          product: {
            pid: warioProductInstance.productId,
            modifiers: modifiers
          },
          quantity: parseInt(line.quantity)
        };
      });
  }
  catch (err: any) {
    const errorDetail = `Got error when attempting to ingest 3p line items (${JSON.stringify(lineItems)}) got error: ${JSON.stringify(err, Object.getOwnPropertyNames(err), 2)}`;
    logger.error(errorDetail);
    throw errorDetail;
  }
  return [];

}

export const CreateFulfillment = (info: SquareOrderFulfillmentInfo): OrderFulfillment => {
  return {
    type: "PICKUP",
    pickupDetails: {
      scheduleType: 'SCHEDULED',
      recipient: {
        displayName: info.displayName.slice(0, 254),
        emailAddress: info.emailAddress,
        phoneNumber: info.phoneNumber
      },
      pickupAt: formatRFC3339(info.pickupAt),
      ...(info.note ? { note: info.note.slice(0, 499) } : {})
    },
  };
}

const OptionInstanceToSquareIdSpecifier = (optionInstance: IOptionInstance) => {
  switch (optionInstance.placement) {
    case OptionPlacement.LEFT: return "MODIFIER_LEFT";
    case OptionPlacement.RIGHT: return "MODIFIER_RIGHT";
    case OptionPlacement.WHOLE:
      switch (optionInstance.qualifier) {
        case OptionQualifier.REGULAR: return "MODIFIER_WHOLE";
        case OptionQualifier.HEAVY: return "MODIFIER_HEAVY";
        case OptionQualifier.LITE: return "MODIFIER_LITE";
        case OptionQualifier.OTS: return "MODIFIER_OTS";
      }
  }
  logger.error(`UNHANDLED OPTION INSTANCE ${JSON.stringify(optionInstance)}`);
  return "MODIFIER_WHOLE";
}

const CreateWarioCustomAttribute = (locationIds: string[]): CatalogObject => {
  return {
    id: "#WARIOID",
    type: "CUSTOM_ATTRIBUTE_DEFINITION",
    presentAtAllLocations: false,
    presentAtLocationIds: locationIds,
    customAttributeDefinitionData: {
      allowedObjectTypes: [
        "ITEM",
        "ITEM_VARIATION"
      ],
      name: "WARIO External ID",
      type: "STRING",
      appVisibility: "APP_VISIBILITY_HIDDEN",
      key: "WARIO_",
      stringConfig: {
        enforceUniqueness: false
      }
    }
  };
}

/**
 * 
 * @param mappings 
 * @param batch ALL BATCHES MUST BE THE SAME LENGTH IN A CALL
 * @returns 
 */
export const IdMappingsToExternalIds = (mappings: CatalogIdMapping[] | undefined, batch: string): KeyValue[] =>
  mappings?.filter(x => x.clientObjectId!.startsWith(`#${batch}_`)).map(x => ({ key: `${WARIO_SQUARE_ID_METADATA_KEY}${x.clientObjectId!.substring(2 + batch.length)}`, value: x.objectId! })) ?? [];

export const MapPaymentStatus = (sqStatus: string) => {
  switch (sqStatus) {
    case 'APPROVED':
    case 'PENDING':
      return TenderBaseStatus.AUTHORIZED;
    case 'COMPLETED':
      return TenderBaseStatus.COMPLETED;
    case 'CANCELED':
    case 'FAILED':
      return TenderBaseStatus.CANCELED;
  }
  return TenderBaseStatus.CANCELED;
}

export const CreateOrderStoreCredit = (locationId: string, referenceId: string, amount: IMoney, note: string): Order => {
  return {
    referenceId: referenceId,
    lineItems: [{
      quantity: "1",
      catalogObjectId: VARIABLE_PRICE_STORE_CREDIT_CATALOG_ID,
      basePriceMoney: IMoneyToBigIntMoney(amount),
      note: note
    }],
    locationId,
    state: "OPEN",
  }
}

export const CreateOrdersForPrintingFromCart = (
  locationId: string,
  referenceId: string,
  ticketName: string,
  cart: CoreCartEntry<WProduct>[],
  fulfillmentInfo: SquareOrderFulfillmentInfo): Order[] => {

  const carts: CoreCartEntry<WProduct>[][] = [];
  // split out the items we need to get printed
  const cartEntriesByPrinterGroup = CartByPrinterGroup(cart, CatalogProviderInstance.CatalogSelectors.productEntry);
  // this checks if there's anything left in the queue
  while (Object.values(cartEntriesByPrinterGroup).reduce((acc, x) => acc || x.length > 0, false)) {
    const orderEntries: CoreCartEntry<WProduct>[] = [];
    Object.entries(cartEntriesByPrinterGroup)
      .forEach(([pgId, cartEntryList]) => {
        if (CatalogProviderInstance.PrinterGroups[pgId]!.singleItemPerTicket) {
          const { product, categoryId, quantity } = cartEntryList[cartEntryList.length - 1];
          if (quantity === 1) {
            orderEntries.push(cartEntryList.pop()!);
          } else {
            // multiple items in the entry
            orderEntries.push({ categoryId, product, quantity: 1 });
            cartEntryList[cartEntryList.length - 1] = { product, categoryId, quantity: cartEntryList[cartEntryList.length - 1].quantity - 1 };
          }
        } else {
          orderEntries.push(...cartEntryList.splice(0));
        }
        if (cartEntryList.length === 0) {
          delete cartEntriesByPrinterGroup[pgId];
        }
      });
    carts.push(orderEntries);
  }
  return carts.map((cart, i) => {
    return CreateOrderFromCart(
      locationId,
      referenceId,
      [{
        t: DiscountMethod.ManualPercentage,
        createdAt: Date.now(),
        discount: {
          reason: 'PrintOrder',
          amount: {
            currency: CURRENCY.USD,
            amount: cart.reduce((acc, x) => acc + (x.product.m.price.amount * x.quantity), 0),
          },
          percentage: 1,
        },
        status: TenderBaseStatus.AUTHORIZED
      }],
      [{ amount: { currency: CURRENCY.USD, amount: 0 } }],
      cart,
      false,
      ticketName,
      fulfillmentInfo)
  });
}


export const CreateOrderForMessages = (
  locationId: string,
  referenceId: string,
  ticketName: string,
  messages: { squareItemVariationId: string; message: string[]; }[],
  fulfillmentInfo: SquareOrderFulfillmentInfo): Order => {
  const truncatedTicketName = ticketName.slice(0, 29)
  return {
    lineItems: messages.map(x => ({
      quantity: "1",
      catalogObjectId: x.squareItemVariationId,
      itemType: "ITEM",
      modifiers: x.message.map(msg => ({
        basePriceMoney: { currency: "USD", amount: 0n },
        name: msg
      }))
    })),
    referenceId,
    pricingOptions: {
      autoApplyDiscounts: true,
      autoApplyTaxes: true
    },
    taxes: [],
    locationId,
    state: "OPEN",
    ...(truncatedTicketName.length > 0 ? { ticketName: truncatedTicketName } : {}),
    fulfillments: [CreateFulfillment(fulfillmentInfo)],
  };

}
const WProductModifiersToSquareModifiers = (product: WProduct): OrderLineItemModifier[] => {
  const acc: OrderLineItemModifier[] = [];
  // NOTE: only supports whole pizzas, needs work to support split pizzas
  product.p.modifiers.forEach(mod => {
    const modifierTypeEntry = CatalogProviderInstance.Catalog.modifiers[mod.modifierTypeId]!;
    const baseProductInstanceSelectedOptionsForModifierType = CatalogProviderInstance.Catalog.productInstances[product.m.pi[0]].modifiers.find(x => x.modifierTypeId === mod.modifierTypeId)?.options ?? [];
    mod.options.forEach((option) => {
      const catalogOption = CatalogProviderInstance.Catalog.options[option.optionId];
      const squareModifierId = GetSquareIdFromExternalIds(catalogOption.externalIDs, OptionInstanceToSquareIdSpecifier(option));
      if (modifierTypeEntry.modifierType.max_selected === 1 ||
        baseProductInstanceSelectedOptionsForModifierType.findIndex(x => x.optionId === option.optionId && x.placement === option.placement && x.qualifier === option.qualifier) === -1) {
        acc.push(squareModifierId === null ? {
          basePriceMoney: IMoneyToBigIntMoney(catalogOption.price),
          name: catalogOption.displayName
        } : {
          catalogObjectId: squareModifierId,
          quantity: "1"
        });
      }
    });
  });
  return acc;
}

export const CreateOrderFromCart = (
  locationId: string,
  referenceId: string,
  discounts: OrderLineDiscount[],
  taxes: OrderTax[],
  cart: CoreCartEntry<WProduct>[],
  hasBankersRoundingTaxSkew: boolean,
  ticketName: string,
  fulfillmentInfo: SquareOrderFulfillmentInfo | null): Order => {

  return {
    referenceId,
    lineItems: Object.values(cart).map(x => {
      const catalogProductInstance = CatalogProviderInstance.Catalog.productInstances[x.product.m.pi[PRODUCT_LOCATION.LEFT]];
      const catalogProduct = CatalogProviderInstance.CatalogSelectors.productEntry(x.product.p.productId)!;
      const squareItemVariationId = GetSquareIdFromExternalIds(catalogProductInstance.externalIDs, "ITEM_VARIATION");
      // // left and right catalog product instance are the same, 
      // if (x.product.m.pi[PRODUCT_LOCATION.LEFT] === x.product.m.pi[PRODUCT_LOCATION.RIGHT]) {

      //   const wholeModifiers: OrderLineItemModifier[] = x.product.m.exhaustive_modifiers.whole.map(mtid_moid => {
      //     const catalogOption = CatalogProviderInstance.Catalog.options[mtid_moid[1]];
      //     return { basePriceMoney: IMoneyToBigIntMoney(catalogOption.price), name: catalogOption.displayName }
      //   })
      // } else {
      //   // left and right catalog product instance aren't the same. this isn't really supported by square, so we'll do our best
      //   // TODO: need to create a split product item that just bypasses square's lack of support here

      // }
      const retVal: OrderLineItem = {
        quantity: x.quantity.toString(10),
        ...(squareItemVariationId === null ? {
          name: x.product.m.name,
          variationName: x.product.m.name,
          basePriceMoney: IMoneyToBigIntMoney(catalogProduct.product.price)
        } : {
          catalogObjectId: squareItemVariationId,
        }),
        itemType: "ITEM",
        modifiers: WProductModifiersToSquareModifiers(x.product)
      };
      return retVal;
    }),
    discounts: [...discounts.map((discount): OrderLineItemDiscount => {
      switch (discount.t) {
        case DiscountMethod.CreditCodeAmount:
          return {
            type: 'VARIABLE_AMOUNT',
            scope: 'ORDER',
            //catalogObjectId: DISCOUNT_CATALOG_ID,
            name: `Discount Code: ${discount.discount.code}`,
            amountMoney: IMoneyToBigIntMoney(discount.discount.balance),
            appliedMoney: IMoneyToBigIntMoney(discount.discount.amount),
            metadata: {
              enc: discount.discount.lock.enc,
              iv: discount.discount.lock.iv,
              auth: discount.discount.lock.auth,
              code: discount.discount.code
            }
          };
        case DiscountMethod.ManualAmount: {
          return {
            type: 'FIXED_AMOUNT',
            scope: 'ORDER',
            name: discount.discount.reason,
            amountMoney: IMoneyToBigIntMoney(discount.discount.amount),
            appliedMoney: IMoneyToBigIntMoney(discount.discount.amount),
          };
        }
        case DiscountMethod.ManualPercentage: {
          return {
            type: 'FIXED_PERCENTAGE',
            scope: 'ORDER',
            name: discount.discount.reason,
            percentage: (discount.discount.percentage * 100).toFixed(2),
          };
        }
      }
    })
    ],
    pricingOptions: {
      autoApplyDiscounts: true,
      autoApplyTaxes: false
    },
    taxes: taxes.map(tax => ({
      catalogObjectId: hasBankersRoundingTaxSkew ? SQUARE_BANKERS_ADJUSTED_TAX_RATE_CATALOG_ID : SQUARE_TAX_RATE_CATALOG_ID,
      appliedMoney: IMoneyToBigIntMoney(tax.amount),
      scope: 'ORDER'
    })),
    locationId,
    state: "OPEN",
    ...(ticketName.length > 0 ? { ticketName: ticketName.slice(0, 29) } : {}),
    fulfillments: fulfillmentInfo ? [CreateFulfillment(fulfillmentInfo)] : [],
  };
}


/**
 * BEGIN CATALOG SECTION
 */

export const PrinterGroupToSquareCatalogObjectPlusDummyProduct = (locationIds: string[], printerGroup: Omit<PrinterGroup, 'id'>, currentObjects: Pick<CatalogObject, 'id' | 'version'>[], batch: string): CatalogObject[] => {
  const squareCategoryId = GetSquareIdFromExternalIds(printerGroup.externalIDs, 'CATEGORY') ?? `#${batch}_CATEGORY`;
  const versionCategoryId = currentObjects.find(x => x.id === squareCategoryId)?.version ?? null;
  const squareItemId = GetSquareIdFromExternalIds(printerGroup.externalIDs, 'ITEM') ?? `#${batch}_ITEM`;
  const versionItem = currentObjects.find(x => x.id === squareItemId)?.version ?? null;
  const squareItemVariationId = GetSquareIdFromExternalIds(printerGroup.externalIDs, 'ITEM_VARIATION') ?? `#${batch}_ITEM_VARIATION`;
  const versionItemVariation = currentObjects.find(x => x.id === squareItemVariationId)?.version ?? null;

  return [{
    id: squareCategoryId,
    ...(versionCategoryId !== null ? { version: versionCategoryId } : {}),
    type: 'CATEGORY',
    // categories have to go to all locations
    // presentAtAllLocations: false,
    // presentAtLocationIds: locationIds,
    categoryData: {
      name: printerGroup.name,
    }
  },
  {
    id: squareItemId,
    type: 'ITEM',
    presentAtAllLocations: false,
    presentAtLocationIds: locationIds,
    ...(versionItem !== null ? { version: versionItem } : {}),
    itemData: {
      categories: [ {id: squareCategoryId } ],
      reportingCategory: {id: squareCategoryId },
      availableElectronically: true,
      availableForPickup: true,
      availableOnline: true,
      descriptionHtml: "MESSAGE",
      name: "MESSAGE",
      productType: "REGULAR",
      skipModifierScreen: true,
      variations: [{
        id: squareItemVariationId,
        type: 'ITEM_VARIATION',
        presentAtAllLocations: false,
        presentAtLocationIds: locationIds,
        ...(versionItemVariation !== null ? { version: versionItemVariation } : {}),
        itemVariationData: {
          itemId: squareItemId,
          //name: "MESSAGE",
          pricingType: 'FIXED_PRICING',
          priceMoney: IMoneyToBigIntMoney({ currency: CURRENCY.USD, amount: 0 }),
          sellable: true,
          stockable: true,
          availableForBooking: false
        }
      }]
    }
  }];
}

export const ProductInstanceToSquareCatalogObject = (
  locationIds: string[],
  product: Pick<IProduct, 'modifiers' | 'price' | 'disabled'>,
  productInstance: Omit<IProductInstance, 'id' | 'productId'>,
  printerGroup: PrinterGroup | null,
  catalogSelectors: ICatalogSelectors,
  currentObjects: Pick<CatalogObject, 'id' | 'version' | 'itemData'>[],
  batch: string): CatalogObject => {
  // todo: we need a way to handle naming of split/super custom product instances
  // do we need to add an additional variation on the square item corresponding to the base product instance for split and otherwise unruly product instances likely with pricingType: VARIABLE?
  // maybe we add variations for each half and half combo?
  // maybe we can just set variationName on the line item and call it good?
  // TODO: when we transition off the square POS, if we're still using the finance or employee management or whatever, we'll need to pull pre-selected modifiers off of the ITEM_VARIATIONs for a product instance
  // 
  const squareItemId = GetSquareIdFromExternalIds(productInstance.externalIDs, 'ITEM') ?? `#${batch}_ITEM`;
  const versionItem = currentObjects.find(x => x.id === squareItemId)?.version ?? null;
  const productTypeItem = currentObjects.find(x => x.id === squareItemId)?.itemData?.productType ?? 'REGULAR';
  const squareItemVariationId = GetSquareIdFromExternalIds(productInstance.externalIDs, 'ITEM_VARIATION') ?? `#${batch}_ITEM_VARIATION`;
  const versionItemVariation = currentObjects.find(x => x.id === squareItemVariationId)?.version ?? null;
  const isBlanketDisabled = product.disabled && product.disabled.start > product.disabled.end;
  let instancePriceWithoutSingleSelectModifiers = product.price.amount;
  const modifierListInfo: CatalogItemModifierListInfo[] = [];
  product.modifiers.forEach(mtspec => {
    const modifierEntry = catalogSelectors.modifierEntry(mtspec.mtid)!;
    const selectedOptionsForModifierType = productInstance.modifiers.find(x => x.modifierTypeId === mtspec.mtid)?.options ?? [];
    if (modifierEntry.modifierType.max_selected === 1) {
      // single select modifiers get added to the square product
      const squareModifierListId = GetSquareIdFromExternalIds(modifierEntry.modifierType.externalIDs, 'MODIFIER_LIST')!;
      if (squareModifierListId === null) {
        logger.error(`Missing MODIFIER_LIST in ${JSON.stringify(modifierEntry.modifierType.externalIDs)}`);
        return;
      }
      if (selectedOptionsForModifierType.length > 1) {
        logger.error(`Mutiple selected modifier options ${JSON.stringify(selectedOptionsForModifierType)} found for single select modifier ${JSON.stringify(mtspec)}`)
        return;
      }
      modifierListInfo.push({
        modifierListId: squareModifierListId!,
        minSelectedModifiers: modifierEntry.modifierType.min_selected,
        maxSelectedModifiers: 1,
        ...(selectedOptionsForModifierType.length > 0 ? {
          modifierOverrides: selectedOptionsForModifierType.map((optionInstance) => ({
            modifierId: GetSquareIdFromExternalIds(catalogSelectors.option(optionInstance.optionId)!.externalIDs, OptionInstanceToSquareIdSpecifier(optionInstance))!,
            onByDefault: true
          }))
        } : {})
      })
    } else {
      // add the modifier to the list
      const squareModifierListId = GetSquareIdFromExternalIds(modifierEntry.modifierType.externalIDs, 'MODIFIER_LIST')!;
      if (squareModifierListId === null) {
        logger.error(`Missing MODIFIER_LIST in ${JSON.stringify(modifierEntry.modifierType.externalIDs)}`);
        return;
      }
      modifierListInfo.push({
        modifierListId: squareModifierListId,
        minSelectedModifiers: modifierEntry.modifierType.min_selected,
        maxSelectedModifiers: modifierEntry.modifierType.max_selected ?? -1,
      })
      // multi select modifiers, if pre-selected get added to the built in price
      modifierEntry.options.forEach(oId => {
        const option = catalogSelectors.option(oId)!;
        const optionInstance = selectedOptionsForModifierType.find(x => x.optionId === option.id) ?? null;
        if (optionInstance && optionInstance.placement !== OptionPlacement.NONE) {
          instancePriceWithoutSingleSelectModifiers += optionInstance.qualifier === OptionQualifier.HEAVY ? option.price.amount * 2 : option.price.amount;
        }
      })
    }
  });

  return {
    id: squareItemId,
    type: 'ITEM',
    presentAtAllLocations: false,
    presentAtLocationIds: locationIds,
    ...(versionItem !== null ? { version: versionItem } : {}),
    itemData: {
      ...(printerGroup ? { categories: [ { id: GetSquareIdFromExternalIds(printerGroup.externalIDs, 'CATEGORY')! } ], reportingCategory: { id: GetSquareIdFromExternalIds(printerGroup.externalIDs, 'CATEGORY')!} } : {}),
      abbreviation: productInstance.shortcode.slice(0, 24),
      availableElectronically: true,
      availableForPickup: true,
      availableOnline: true,
      isArchived: isBlanketDisabled,
      descriptionHtml: productInstance.description,
      name: productInstance.displayFlags.posName ? productInstance.displayFlags.posName : productInstance.displayName,
      productType: productTypeItem,
      taxIds: [SQUARE_TAX_RATE_CATALOG_ID],
      skipModifierScreen: product.modifiers.length === 0 || productInstance.displayFlags.order.skip_customization,
      modifierListInfo,
      variations: [{
        id: squareItemVariationId,
        type: 'ITEM_VARIATION',
        presentAtAllLocations: false,
        presentAtLocationIds: locationIds,
        ...(versionItemVariation !== null ? { version: versionItemVariation } : {}),
        itemVariationData: {
          itemId: squareItemId,
          // name: productInstance.displayName, We omit this variation name so the tickets and receipts are shorter
          pricingType: 'FIXED_PRICING',
          priceMoney: IMoneyToBigIntMoney({ currency: product.price.currency, amount: instancePriceWithoutSingleSelectModifiers }),
          sellable: true,
          stockable: true,
          availableForBooking: false
        }
      }]
    }
  };
}

export const ModifierOptionPlacementsAndQualifiersToSquareCatalogObjects = (locationIds: string[], modifierListId: string, option: Omit<IOption, 'id' | 'modifierTypeId'>, currentObjects: Pick<CatalogObject, 'id' | 'version'>[], batch: string): CatalogObject[] => {
  const squareIdLeft = GetSquareIdFromExternalIds(option.externalIDs, 'MODIFIER_LEFT') ?? `#${batch}_MODIFIER_LEFT`;
  const versionLeft = currentObjects.find(x => x.id === squareIdLeft)?.version ?? null;
  const squareIdWhole = GetSquareIdFromExternalIds(option.externalIDs, 'MODIFIER_WHOLE') ?? `#${batch}_MODIFIER_WHOLE`;
  const versionWhole = currentObjects.find(x => x.id === squareIdWhole)?.version ?? null;
  const squareIdRight = GetSquareIdFromExternalIds(option.externalIDs, 'MODIFIER_RIGHT') ?? `#${batch}_MODIFIER_RIGHT`;
  const versionRight = currentObjects.find(x => x.id === squareIdRight)?.version ?? null;
  const squareIdHeavy = GetSquareIdFromExternalIds(option.externalIDs, 'MODIFIER_HEAVY') ?? `#${batch}_MODIFIER_HEAVY`;
  const versionHeavy = currentObjects.find(x => x.id === squareIdHeavy)?.version ?? null;
  const squareIdLite = GetSquareIdFromExternalIds(option.externalIDs, 'MODIFIER_LITE') ?? `#${batch}_MODIFIER_LITE`;
  const versionLite = currentObjects.find(x => x.id === squareIdLite)?.version ?? null;
  const squareIdOts = GetSquareIdFromExternalIds(option.externalIDs, 'MODIFIER_OTS') ?? `#${batch}_MODIFIER_OTS`;
  const versionOts = currentObjects.find(x => x.id === squareIdOts)?.version ?? null;
  const baseOrdinal = (option.ordinal * 6);
  const modifierLite: CatalogObject[] = option.metadata.allowLite ? [{
    id: squareIdLite,
    type: 'MODIFIER',
    presentAtAllLocations: false,
    presentAtLocationIds: locationIds,
    ...(versionLite !== null ? { version: versionLite } : {}),
    modifierData: {
      name: `LITE ${option.displayName}`,
      // todo kitchenName: `LITE ${option.shortcode}`,
      ordinal: baseOrdinal + 4,
      modifierListId: modifierListId,
      priceMoney: IMoneyToBigIntMoney(option.price),
    }
  }] : [];
  const modifierHeavy: CatalogObject[] = option.metadata.allowHeavy ? [{
    id: squareIdHeavy,
    type: 'MODIFIER',
    presentAtAllLocations: false,
    presentAtLocationIds: locationIds,
    ...(versionHeavy !== null ? { version: versionHeavy } : {}),
    modifierData: {
      name: `HEAVY ${option.displayName}`,
      // todo kitchenName: `HEAVY ${option.shortcode}`,
      ordinal: baseOrdinal + 5,
      modifierListId: modifierListId,
      priceMoney: IMoneyToBigIntMoney({ currency: option.price.currency, amount: option.price.amount * 2 }),
    }
  }] : [];
  const modifierOts: CatalogObject[] = option.metadata.allowOTS ? [{
    id: squareIdOts,
    type: 'MODIFIER',
    presentAtAllLocations: false,
    presentAtLocationIds: locationIds,
    ...(versionOts !== null ? { version: versionOts } : {}),
    modifierData: {
      name: `OTS ${option.displayName}`,
      // todo kitchenName: `OTS ${option.shortcode}`,
      ordinal: baseOrdinal + 6,
      modifierListId: modifierListId,
      priceMoney: IMoneyToBigIntMoney(option.price),
    }
  }] : [];
  const modifiersSplit: CatalogObject[] = option.metadata.can_split ? [{
    id: squareIdLeft,
    type: 'MODIFIER',

    presentAtAllLocations: false,
    presentAtLocationIds: locationIds,
    ...(versionLeft !== null ? { version: versionLeft } : {}),
    modifierData: {
      name: `L) ${option.displayName}`,
      // todo kitchenName: `L) ${option.shortcode}`,
      ordinal: baseOrdinal + 1,
      modifierListId: modifierListId,
      priceMoney: IMoneyToBigIntMoney(option.price),
    }
  }, {
    id: squareIdRight,
    type: 'MODIFIER',
    presentAtAllLocations: false,
    presentAtLocationIds: locationIds,
    ...(versionRight !== null ? { version: versionRight } : {}),
    modifierData: {
      name: `R) ${option.displayName}`,
      // todo kitchenName: `R) ${option.shortcode}`,
      ordinal: baseOrdinal + 3,
      modifierListId: modifierListId,
      priceMoney: IMoneyToBigIntMoney(option.price),
    }
  }] : []
  const modifierWhole: CatalogObject = {
    id: squareIdWhole,
    type: 'MODIFIER',

    presentAtAllLocations: false,
    presentAtLocationIds: locationIds,
    ...(versionWhole !== null ? { version: versionWhole } : {}),
    modifierData: {
      name: option.displayName,
      // todo kitchenName: `${option.shortcode}`,
      ordinal: baseOrdinal + 2,
      modifierListId: modifierListId,
      priceMoney: IMoneyToBigIntMoney(option.price),
    }
  };
  return [...modifiersSplit, modifierWhole, ...modifierHeavy, ...modifierLite, ...modifierOts].sort((a, b) => a.modifierData!.ordinal! - b.modifierData!.ordinal!);
}

// export const ModifierOptionToSquareCatalogObject = (
//   locationIds: string[],
//   modifierTypeOrdinal: number,
//   option: Omit<IOption, 'id' | 'modifierTypeId'>,
//   currentObjects: Pick<CatalogObject, 'id' | 'version'>[],
//   batch: string): CatalogObject => {
//   const modifierListId = GetSquareIdFromExternalIds(option.externalIDs, 'MODIFIER_LIST') ?? `#${batch}_MODIFIER_LIST`;
//   const version = currentObjects.find(x => x.id === modifierListId)?.version ?? null;
//   const squareName = `${('0000' + (modifierTypeOrdinal * 100 + option.ordinal)).slice(-4)}| ${option.displayName}`;
//   return {
//     id: modifierListId,
//     ...(version !== null ? { version } : {}),
//     type: 'MODIFIER_LIST',
//     presentAtAllLocations: false,
//     presentAtLocationIds: locationIds,
//     modifierListData: {
//       name: squareName,
//       ordinal: modifierTypeOrdinal * 1024 + option.ordinal,
//       selectionType: 'SINGLE',
//       modifiers: ModifierOptionPlacementsAndQualifiersToSquareCatalogObjects(locationIds, modifierListId, option, currentObjects, batch)
//     }
//   }
// };

export const ModifierTypeToSquareCatalogObject = (
  locationIds: string[],
  modifierType: Pick<IOptionType, 'name' | 'displayName' | 'ordinal' | 'externalIDs' | 'max_selected' | 'min_selected' | 'displayFlags'>,
  options: Omit<IOption, 'id' | 'modifierTypeId'>[],
  currentObjects: Pick<CatalogObject, 'id' | 'version'>[],
  batch: string): CatalogObject => {
  const modifierListId = GetSquareIdFromExternalIds(modifierType.externalIDs, 'MODIFIER_LIST') ?? `#${batch}_MODIFIER_LIST`;
  const version = currentObjects.find(x => x.id === modifierListId)?.version ?? null;
  const displayName = modifierType.displayName?.length > 0 ? modifierType.displayName : modifierType.name;
  const squareName = modifierType.displayFlags.is3p ? displayName : `${('0000' + (modifierType.ordinal * 100)).slice(-4)}| ${displayName}`;
  return {
    id: modifierListId,
    ...(version !== null ? { version } : {}),
    type: 'MODIFIER_LIST',
    presentAtAllLocations: false,
    presentAtLocationIds: locationIds,
    modifierListData: {
      name: squareName,
      ordinal: modifierType.ordinal * 1024,
      selectionType: 'MULTIPLE', // this should always be MULTIPLE otherwise square autoselects a modifier
      modifiers: options.sort((a, b) => a.ordinal - b.ordinal).map((o, i) => ModifierOptionPlacementsAndQualifiersToSquareCatalogObjects(locationIds, modifierListId, o, currentObjects, `${batch}S${('000' + i).slice(-3)}S`)).flat()
    }
  };
}


