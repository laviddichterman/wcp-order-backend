import { OrderLineItem, Money, OrderLineItemModifier, Order, CatalogObject, CatalogIdMapping } from 'square';
import logger from '../logging';
import { DataProviderInstance } from './dataprovider';
import { CatalogProviderInstance } from './catalog_provider';
import { CategorizedRebuiltCart, IMoney, TenderBaseStatus, WOrderInstance, PRODUCT_LOCATION, IProduct, IProductInstance, KeyValue, ICatalogSelectors, OptionPlacement, OptionQualifier, IOption, IOptionInstance } from '@wcp/wcpshared';
import { formatRFC3339 } from 'date-fns';
import { IS_PRODUCTION } from '../utils';

export const SQUARE_TAX_RATE_CATALOG_ID = IS_PRODUCTION ? "TMG7E3E5E45OXHJTBOHG2PMS" : "LOFKVY5UC3SLKPT2WANSBPZQ";
export const VARIABLE_PRICE_STORE_CREDIT_CATALOG_ID = IS_PRODUCTION ? "DNP5YT6QDIWTB53H46F3ECIN" : "RBYUD52HGFHPL4IG55LBHQAG";

export const WARIO_SQUARE_ID_METADATA_KEY = 'SQID_';

export const BigIntMoneyToIntMoney = (bigIntMoney: Money): IMoney => ({ amount: Number(bigIntMoney.amount!), currency: bigIntMoney.currency! });

export const IMoneyToBigIntMoney = (money: IMoney): Money => ({ amount: BigInt(money.amount), currency: money.currency });

export const GetSquareExternalIds = (externalIds: KeyValue[]) => externalIds.filter(x => x.key.startsWith(WARIO_SQUARE_ID_METADATA_KEY));

export const GetSquareIdIndexFromExternalIds = (externalIds: KeyValue[], specifier: string = '') =>
  externalIds.findIndex(x => x.key === `${WARIO_SQUARE_ID_METADATA_KEY}${specifier}`);
export const GetSquareIdFromExternalIds = (externalIds: KeyValue[], specifier: string = ''): string | null => {
  const kvIdx = GetSquareIdIndexFromExternalIds(externalIds, specifier);
  return kvIdx === -1 ? null : externalIds[kvIdx].value;
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

/**
 * 
 * @param mappings 
 * @param batch ALL BATCHES MUST BE THE SAME LENGTH IN A CALL
 * @returns 
 */
export const IdMappingsToExternalIds = (mappings: CatalogIdMapping[] | undefined, batch: string): KeyValue[] =>
  mappings?.filter(x=>x.clientObjectId!.startsWith(`#${batch}`)).map(x => ({ key: `${WARIO_SQUARE_ID_METADATA_KEY}${x.clientObjectId!.substring(1+batch.length)}`, value: x.objectId! })) ?? [];

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


export const CreateOrderFromCart = (reference_id: string,
  orderBeforeCharging: Omit<WOrderInstance, 'id' | 'metadata' | 'status' | 'refunds' | 'locked'>,
  promisedTime: Date | number,
  cart: CategorizedRebuiltCart): Order => {

  return {
    referenceId: reference_id,
    lineItems: Object.values(cart).flatMap(e => e.map(x => {
      // left and right catalog product instance are the same, 
      if (x.product.m.pi[PRODUCT_LOCATION.LEFT] === x.product.m.pi[PRODUCT_LOCATION.RIGHT]) {
        const catalogProductInstance = CatalogProviderInstance.Catalog.productInstances[x.product.m.pi[PRODUCT_LOCATION.LEFT]];
        const wholeModifiers: OrderLineItemModifier[] = x.product.m.exhaustive_modifiers.whole.map(mtid_moid => {
          const catalogOption = CatalogProviderInstance.Catalog.options[mtid_moid[1]];
          return { basePriceMoney: IMoneyToBigIntMoney(catalogOption.price), name: catalogOption.displayName }
        })
      } else {
        // left and right catalog product instance aren't the same. this isn't really supported by square, so we'll do our best
        // TODO: need to create a split product item that just bypasses square's lack of support here

      }
      return {
        quantity: x.quantity.toString(10),
        //catalogObjectId: VARIABLE_PRICE_STORE_CREDIT_CATALOG_ID,
        basePriceMoney: IMoneyToBigIntMoney(x.product.p.PRODUCT_CLASS.price),
        itemType: "ITEM",
        name: x.product.m.name, // its either catalogObjectId or name
        modifiers: x.product.p.modifiers.flatMap(mod => mod.options.map(option => {
          const catalogOption = CatalogProviderInstance.Catalog.options[option.optionId];
          return { basePriceMoney: IMoneyToBigIntMoney(catalogOption.price), name: catalogOption.displayName } as OrderLineItemModifier
        }))
      } as OrderLineItem;
    })),
    discounts: [...orderBeforeCharging.discounts.map(discount => ({
      type: 'VARIABLE_AMOUNT',
      scope: 'ORDER',
      catalogObjectId: 'AKIYDPB5WJD2HURCWWZSAIF5',
      name: `Discount Code: ${discount.discount.code}`,
      amountMoney: IMoneyToBigIntMoney(discount.discount.amount),
      appliedMoney: IMoneyToBigIntMoney(discount.discount.amount),
      metadata: {
        enc: discount.discount.lock.enc,
        iv: discount.discount.lock.iv,
        auth: discount.discount.lock.auth,
        code: discount.discount.code
      }
    }))
    ],
    pricingOptions: {
      autoApplyDiscounts: true,
      autoApplyTaxes: true
    },
    taxes: orderBeforeCharging.taxes.map(tax => ({
      catalogObjectId: SQUARE_TAX_RATE_CATALOG_ID,
      appliedMoney: IMoneyToBigIntMoney(tax.amount),
      scope: 'ORDER'
    })),
    locationId: DataProviderInstance.KeyValueConfig.SQUARE_LOCATION,
    state: "OPEN",
    fulfillments: [{
      type: "PICKUP",
      pickupDetails: {
        scheduleType: 'SCHEDULED',
        recipient: {
          displayName: `${orderBeforeCharging.customerInfo.givenName} ${orderBeforeCharging.customerInfo.familyName}`,
          emailAddress: orderBeforeCharging.customerInfo.email,
          phoneNumber: orderBeforeCharging.customerInfo.mobileNum
        },
        pickupAt: formatRFC3339(promisedTime),
      },
    }],

  };
}

/**
 * BEGIN CATALOG SECTION
 */
export const ProductInstanceToSquareCatalogObject = (locationIds: string[], product: Pick<IProduct, 'modifiers' | 'price'>, productInstance: Omit<IProductInstance, 'id' | 'productId'>, catalogSelectors: ICatalogSelectors, currentObjects: Pick<CatalogObject, 'id' | 'version'>[], batch: string): CatalogObject => {
  // todo: we need a way to handle naming of split/super custom product instances
  // do we need to add an additional variation on the square item corresponding to the base product instance for split and otherwise unruly product instances likely with pricingType: VARIABLE?
  // maybe we add variations for each half and half combo?
  // maybe we can just set variationName on the line item and call it good?

  const squareItemId = GetSquareIdFromExternalIds(productInstance.externalIDs, 'ITEM') ?? `#${batch}ITEM`;
  const versionItem = currentObjects.find(x => x.id === squareItemId)?.version ?? null;
  const squareItemVariationId = GetSquareIdFromExternalIds(productInstance.externalIDs, 'ITEM_VARIATION') ?? `#${batch}ITEM_VARIATION`;
  const versionItemVariation = currentObjects.find(x => x.id === squareItemVariationId)?.version ?? null;
  return {
    id: squareItemId,
    type: 'ITEM',
    presentAtAllLocations: false,
    presentAtLocationIds: locationIds,
    ...(versionItem !== null ? { version: versionItem } : {}),
    itemData: {
      abbreviation: productInstance.shortcode.slice(0, 24),
      availableElectronically: true,
      availableForPickup: true,
      availableOnline: true,
      descriptionHtml: productInstance.description,
      name: productInstance.displayName,
      productType: "REGULAR",
      taxIds: [SQUARE_TAX_RATE_CATALOG_ID],
      skipModifierScreen: productInstance.displayFlags.order.skip_customization,
      modifierListInfo: product.modifiers.map(mtspec => {
        const modifierEntry = catalogSelectors.modifierEntry(mtspec.mtid);
        const selectedOptionsForModifierType = productInstance.modifiers.find(x=>x.modifierTypeId === mtspec.mtid)?.options ?? [];
        return modifierEntry!.options.map(oId => {
          const option = catalogSelectors.option(oId)!;
          const optionInstance = selectedOptionsForModifierType.find(x=>x.optionId === option.id) ?? null;
          const squareModifierListId = GetSquareIdFromExternalIds(option.externalIDs, 'MODIFIER_LIST')!;
          if (squareModifierListId === null) { 
            logger.error(`Missing MODIFIER_LIST in ${option.externalIDs}`);
          }
          return {
            modifierListId: squareModifierListId!,
            minSelectedModifiers: 0,
            maxSelectedModifiers: 1,
            ...(optionInstance ? { modifierOverrides: [{
              modifierId: GetSquareIdFromExternalIds(option.externalIDs, OptionInstanceToSquareIdSpecifier(optionInstance))!,
              onByDefault: true
            }]} : {})
          }
        })
      }).flat(),
      variations: [{
        id: squareItemVariationId,
        type: 'ITEM_VARIATION',
        presentAtAllLocations: false,
        presentAtLocationIds: locationIds,
        ...(versionItemVariation !== null ? { version: versionItemVariation } : {}),
        itemVariationData: {
          itemId: squareItemId,
          name: productInstance.displayName,
          pricingType: 'FIXED_PRICING',
          priceMoney: IMoneyToBigIntMoney(product.price),
          sellable: true,
          stockable: true,
          availableForBooking: false
        }
      }]
    }
  };
}

export const ModifierOptionPlacementsAndQualifiersToSquareCatalogObjects = (locationIds: string[], modifierListId: string, option: Omit<IOption, 'id' | 'modifierTypeId'>, currentObjects: Pick<CatalogObject, 'id' | 'version'>[], batch: string): CatalogObject[] => {
  const squareIdLeft = GetSquareIdFromExternalIds(option.externalIDs, 'MODIFIER_LEFT') ?? `#${batch}MODIFIER_LEFT`;
  const versionLeft = currentObjects.find(x => x.id === squareIdLeft)?.version ?? null;
  const squareIdWhole = GetSquareIdFromExternalIds(option.externalIDs, 'MODIFIER_WHOLE') ?? `#${batch}MODIFIER_WHOLE`;
  const versionWhole = currentObjects.find(x => x.id === squareIdWhole)?.version ?? null;
  const squareIdRight = GetSquareIdFromExternalIds(option.externalIDs, 'MODIFIER_RIGHT') ?? `#${batch}MODIFIER_RIGHT`;
  const versionRight = currentObjects.find(x => x.id === squareIdRight)?.version ?? null;
  const squareIdHeavy = GetSquareIdFromExternalIds(option.externalIDs, 'MODIFIER_HEAVY') ?? `#${batch}MODIFIER_HEAVY`;
  const versionHeavy = currentObjects.find(x => x.id === squareIdHeavy)?.version ?? null;
  const squareIdLite = GetSquareIdFromExternalIds(option.externalIDs, 'MODIFIER_LITE') ?? `#${batch}MODIFIER_LITE`;
  const versionLite = currentObjects.find(x => x.id === squareIdLite)?.version ?? null;
  const squareIdOts = GetSquareIdFromExternalIds(option.externalIDs, 'MODIFIER_OTS') ?? `#${batch}MODIFIER_OTS`;
  const versionOts = currentObjects.find(x => x.id === squareIdOts)?.version ?? null;
  const modifierLite = option.metadata.allowLite ? [{
    id: squareIdLite,
    type: 'MODIFIER',
    presentAtAllLocations: false,
    presentAtLocationIds: locationIds,
    ...(versionLite !== null ? { version: versionLite } : {}),
    modifierData: {
      name: `LITE ${option.displayName}`,
      ordinal: 4,
      modifierListId: modifierListId,
      priceMoney: IMoneyToBigIntMoney(option.price),
    }
  }] : [];
  const modifierHeavy = option.metadata.allowHeavy ? [{
    id: squareIdHeavy,
    type: 'MODIFIER',
    presentAtAllLocations: false,
    presentAtLocationIds: locationIds,
    ...(versionHeavy !== null ? { version: versionHeavy } : {}),
    modifierData: {
      name: `HEAVY ${option.displayName}`,
      ordinal: 5,
      modifierListId: modifierListId,
      priceMoney: IMoneyToBigIntMoney({ currency: option.price.currency, amount: option.price.amount * 2 }),
    }
  }] : [];
  const modifierOts = option.metadata.allowOTS ? [{
    id: squareIdOts,
    type: 'MODIFIER',
    presentAtAllLocations: false,
    presentAtLocationIds: locationIds,
    ...(versionOts !== null ? { version: versionOts } : {}),
    modifierData: {
      name: `OTS ${option.displayName}`,
      ordinal: 6,
      modifierListId: modifierListId,
      priceMoney: IMoneyToBigIntMoney(option.price),
    }
  }] : [];
  const modifiersSplit = option.metadata.can_split ? [{
    id: squareIdLeft,
    type: 'MODIFIER',
    presentAtAllLocations: false,
    presentAtLocationIds: locationIds,
    ...(versionLeft !== null ? { version: versionLeft } : {}),
    modifierData: {
      name: `L) ${option.displayName}`,
      ordinal: 1,
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
      ordinal: 3,
      modifierListId: modifierListId,
      priceMoney: IMoneyToBigIntMoney(option.price),
    }
  }] : []
  const modifierWhole = {
    id: squareIdWhole,
    type: 'MODIFIER',
    presentAtAllLocations: false,
    presentAtLocationIds: locationIds,
    ...(versionWhole !== null ? { version: versionWhole } : {}),
    modifierData: {
      name: option.displayName,
      ordinal: 2,
      modifierListId: modifierListId,
      priceMoney: IMoneyToBigIntMoney(option.price),
    }
  };
  return [...modifiersSplit, modifierWhole, ...modifierHeavy, ...modifierLite, ...modifierOts].sort((a, b) => a.modifierData.ordinal - b.modifierData.ordinal);
}

export const ModifierOptionToSquareCatalogObject = (locationIds: string[], modifierTypeOrdinal: number, option: Omit<IOption, 'id' | 'modifierTypeId'>, currentObjects: Pick<CatalogObject, 'id' | 'version'>[], batch: string): CatalogObject => {
  const modifierListId = GetSquareIdFromExternalIds(option.externalIDs, 'MODIFIER_LIST') ?? `#${batch}MODIFIER_LIST`;
  const version = currentObjects.find(x => x.id === modifierListId)?.version ?? null;
  return {
    id: modifierListId,
    ...(version !== null ? { version } : {}),
    type: 'MODIFIER_LIST',
    presentAtAllLocations: false,
    presentAtLocationIds: locationIds,
    modifierListData: {
      name: option.displayName,
      ordinal: modifierTypeOrdinal * 1024 + option.ordinal,
      selectionType: 'MULTIPLE', // this is just because square doesn't have a concept of "at most one" on the modifier list level
      modifiers: ModifierOptionPlacementsAndQualifiersToSquareCatalogObjects(locationIds, modifierListId, option, currentObjects, batch)
    }
  };
}


