// First-run seed. Everything here is editable by Chris in the shop app
// (Settings) — these are starting values, not the source of truth.
                                               

                       
                                                         
                                       
                                                                                         
                                                               
  

export const DEFAULT_SERVICES            = [
  { id: "auto-tint", name: "Window Tint", short: "Auto tint", kind: "vehicle", options: "tint", online: true, durationMin: 150,
    blurb: "Carbon, ceramic or hybrid film in any shade, 5% to 70%. Full car, fronts only, windshield, or a strip." },
  { id: "headlights", name: "Headlight & Taillight Tint", short: "Light tint", kind: "vehicle", online: true, durationMin: 90,
    blurb: "Smoked, blacked out, or color-shift like Khameleon. Done clean, no bubbles." },
  { id: "chrome-delete", name: "Chrome Delete", short: "Chrome delete", kind: "vehicle", online: true, durationMin: 180,
    blurb: "Window trim, badges and grilles blacked out in gloss or satin vinyl." },
  { id: "calipers", name: "Caliper Painting", short: "Calipers", kind: "vehicle", online: true, durationMin: 180,
    blurb: "High-temp caliper paint in any color. Red behind black wheels is a classic." },
  { id: "wrap", name: "Vinyl Wrap Accents", short: "Wrap", kind: "vehicle", online: true, durationMin: 180,
    blurb: "Hoods, roofs, trunks, mirrors, spoilers and fins. Accent pieces, not full wraps." },
  { id: "detail", name: "Detailing", short: "Detail", kind: "vehicle", online: true, durationMin: 150,
    blurb: "Inside and out. Pairs well with fresh tint." },
  { id: "installs", name: "Cosmetic Installs", short: "Install", kind: "vehicle", online: true, durationMin: 120,
    blurb: "Light to medium aftermarket parts: lips, spoilers, emblems, ambient lighting and more." },
  { id: "building-tint", name: "Home & Commercial Tint", short: "Building tint", kind: "property", online: true, durationMin: 60,
    blurb: "Homes, offices and storefronts. Book a free on-site estimate and Chris will measure and quote." },
];

const day = (start        , end        ) => [{ start, end }];
export const DEFAULT_HOURS        = {
  // Sun .. Sat. Placeholder hours until Chris posts his own in the app.
  weekly: [[], day("10:00", "19:00"), day("10:00", "19:00"), day("10:00", "19:00"), day("10:00", "19:00"), day("10:00", "19:00"), day("09:00", "17:00")],
  overrides: {},
};

export const DEFAULT_RULES        = { stepMin: 30, bufferMin: 15, minNoticeMin: 120, maxDaysOut: 60 };

                        
                                                                
                                                                
                                                                                                 
  

export const DEFAULT_BUSINESS           = {
  name: "C-Lux Customs",
  owner: "Chris",
  phone: "(216) 612-0141",
  instagram: "christintedme",
  city: "Cleveland, OH",
  locations: [],   // Chris adds the shop address(es) in Settings → Shop info
  depositAmount: 25,
  depositNote: "A $25 non-refundable deposit locks in your appointment.",
  depositMethods: [],  // e.g. { label: "Cash App", value: "$cluxcustoms" }
};
