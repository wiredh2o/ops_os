// FedEx native trailing doc tab (last 3/4" of 4" x 6.75" thermal stock).
// Shared so production and certification labels carry an identical tab.

export interface DocTabInput { invoice?: unknown; customer?: unknown; dept?: unknown; handling?: unknown }

const lit = (v: unknown) => (v == null ? '' : String(v)).slice(0, 30);

export function fedexDocTabLabelSpec(doc: DocTabInput | undefined) {
  const zones = [
    { zoneNumber: 1, header: 'Invoice', literalValue: lit(doc?.invoice) },
    { zoneNumber: 2, header: 'Custo', literalValue: lit(doc?.customer) },
    { zoneNumber: 3, header: 'Dept', literalValue: lit(doc?.dept) },
    { zoneNumber: 4, header: 'Date', dataField: 'REQUEST/SHIPMENT/ShipTimestamp' },
    { zoneNumber: 5, header: 'Weight', dataField: 'REQUEST/PACKAGE/Weight/Value' },
    { zoneNumber: 6, header: 'COD', dataField: 'REQUEST/SHIPMENT/SpecialServicesRequested/CodDetail/CodCollectionAmount/Amount' },
    { zoneNumber: 7, header: 'DV', dataField: 'REQUEST/PACKAGE/InsuredValue/Amount' },
    { zoneNumber: 8, header: 'Shipping', dataField: 'REPLY/SHIPMENT/RATES/ACTUAL/TotalBaseCharge/Amount' },
    { zoneNumber: 9, header: 'Special', dataField: 'REPLY/SHIPMENT/RATES/ACTUAL/TotalSurcharges/Amount' },
    { zoneNumber: 10, header: 'Handling', literalValue: lit(doc?.handling ?? '0.00') },
    { zoneNumber: 11, header: 'Total', dataField: 'REPLY/SHIPMENT/RATES/ACTUAL/TotalNetCharge/Amount' },
  ];
  return {
    imageType: 'ZPLII',
    labelStockType: 'STOCK_4X675_LEADING_DOC_TAB',
    labelPrintingOrientation: 'BOTTOM_EDGE_OF_TEXT_FIRST',
    customerSpecifiedDetail: {
      docTabContent: { docTabContentType: 'ZONE001', zone001: { docTabZoneSpecifications: zones } },
    },
  };
}
