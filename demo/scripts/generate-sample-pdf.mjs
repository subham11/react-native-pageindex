/**
 * Generates demo/public/crop_production_guide.pdf
 *
 * A realistic 30-page agricultural handbook with:
 *   - Cover page
 *   - Explicit Table of Contents (format pageIndex TOC-detection expects)
 *   - 7 chapters with 3–4 sections each
 *   - ~220 words per section → ~28–30 pages total
 *
 * Run: node demo/scripts/generate-sample-pdf.mjs
 */

import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../public/crop_production_guide.pdf');

// ─── Colour palette ───────────────────────────────────────────────────────────
const GREEN  = '#1a6b2e';
const DARK   = '#111111';
const MUTED  = '#555555';
const RULE   = '#cccccc';

// ─── Content ──────────────────────────────────────────────────────────────────
const CHAPTERS = [
  {
    num: 1, title: 'Foundations of Crop Production',
    sections: [
      {
        num: '1.1', title: 'Principles of Plant Growth',
        text: [
          `Plants require six essential resources for growth: sunlight, water, carbon dioxide, oxygen,
mineral nutrients, and adequate temperature. Understanding how these factors interact is the
foundation of successful crop production. Photosynthesis converts sunlight and CO₂ into sugars
that fuel plant growth, while respiration uses oxygen to release stored energy.`,
          `The growth cycle of most annual crops proceeds through germination, vegetative growth,
flowering, seed formation, and maturity. Each stage has specific nutritional and environmental
requirements. Disruption at any stage — through drought, pest pressure, or nutrient deficiency —
can significantly reduce final output.`,
          `Modern agronomy emphasises synchronising farming practices with these biological cycles.
Precision planting dates, targeted irrigation schedules, and stage-appropriate fertiliser
applications are all based on a deep understanding of plant physiology. Leaf area index (LAI),
the ratio of leaf surface to ground area, is a key indicator of canopy photosynthetic capacity
and potential yield.`,
        ],
      },
      {
        num: '1.2', title: 'Climate and Growing Zones',
        text: [
          `India's diverse climate supports an extraordinary range of crops. The country is divided
into several agro-climatic zones based on temperature, rainfall, and humidity. The Gangetic
Plain, with its fertile alluvial soils and monsoon rains, supports intensive rice and wheat
cultivation. The Deccan Plateau's semi-arid conditions favour sorghum, pulses, and cotton.`,
          `Kharif crops — planted at the start of the monsoon (June–July) and harvested in autumn —
include rice, maize, sorghum, and cotton. Rabi crops are planted in winter (October–November)
and harvested in spring; wheat, mustard, and chickpea are the most important. Zaid crops,
grown between the main seasons, include vegetables, watermelon, and muskmelon.`,
          `Climate change is altering traditional seasonal patterns. Farmers increasingly face
unpredictable monsoon onset, more frequent droughts and floods, and rising temperatures that
affect crop quality. Adapting varieties and practices to these changing conditions is a central
challenge for modern agriculture. Heat-tolerant and drought-resistant varieties developed by
ICAR and CGIAR centres are increasingly important in this context.`,
        ],
      },
      {
        num: '1.3', title: 'Soil and Crop Compatibility',
        text: [
          `Every crop has preferred soil conditions. Rice thrives in heavy clay soils that retain
water and can be flooded; wheat prefers well-drained loamy soils with moderate fertility.
Cotton demands deep, well-drained soils with slightly acidic to neutral pH. Mismatching crops
to soils leads to water-logging, nutrient stress, and ultimately poor yields.`,
          `Soil texture — the proportion of sand, silt, and clay — determines drainage, aeration,
and water-holding capacity. Sandy soils drain quickly and warm up fast but hold few nutrients.
Clay soils retain moisture and nutrients but can become waterlogged. Loam soils, a balanced
mixture, are generally considered ideal for most field crops.`,
          `Soil organic matter, though typically less than 5% of soil mass, plays an outsized role
in soil health. It improves structure, water retention, microbial activity, and nutrient
cycling. Building organic matter through crop residue retention, cover crops, and compost
application is a long-term investment in farm productivity that pays dividends for decades.`,
        ],
      },
    ],
  },
  {
    num: 2, title: 'Soil Science and Fertility Management',
    sections: [
      {
        num: '2.1', title: 'Understanding Soil Types and Texture',
        text: [
          `India's soils span a rich spectrum. Alluvial soils, deposited by rivers across the
Indo-Gangetic Plain, are the most extensive and productive — supporting wheat, rice, sugarcane,
and oilseeds. Black cotton soils (Regur) in Maharashtra and Madhya Pradesh are clay-rich,
moisture-retentive, and ideal for cotton and sorghum. Red and laterite soils in the Deccan
are low in nitrogen and phosphorus but respond well to organic amendments.`,
          `Soil texture is determined by the particle size distribution: sand (0.05–2 mm), silt
(0.002–0.05 mm), and clay (<0.002 mm). The USDA texture triangle classifies soils into 12
categories. A simple field test — moistening a soil sample and rolling it between thumb and
forefinger — reveals clay content through its stickiness and plasticity.`,
          `Soil structure, distinct from texture, describes how particles aggregate into clumps or
peds. Good structure promotes root penetration, water infiltration, and aeration. Tillage
practices, organic matter additions, and the activity of earthworms and microorganisms
all influence soil structure over time. Conservation tillage — minimum or zero tillage — is
increasingly promoted to preserve structure and reduce costs.`,
        ],
      },
      {
        num: '2.2', title: 'Soil pH: Measurement and Correction',
        text: [
          `Soil pH, measured on a scale of 0–14, profoundly affects nutrient availability and
microbial activity. Most crops grow optimally at pH 6.0–7.0, where the widest range of
nutrients is soluble and accessible. At pH below 5.5, aluminium and manganese become
toxic; above pH 8.0, iron, zinc, and phosphorus become insoluble.`,
          `pH is measured using portable meters, colorimetric kits, or laboratory analysis. Soil
testing every 2–3 years gives farmers the information needed to correct imbalances before
they limit yields. Extension services across India offer affordable soil testing at Krishi
Vigyan Kendras (KVKs) in every district.`,
          `Acidic soils are treated with agricultural lime (calcium carbonate) or dolomite
(calcium-magnesium carbonate). Rates of 1–4 tonnes per hectare are typical, applied 3–6
months before planting to allow pH adjustment. Alkaline and sodic soils, common in arid
and semi-arid regions, are treated with gypsum (calcium sulfate) at 2–5 t/ha to displace
sodium and improve permeability.`,
        ],
      },
      {
        num: '2.3', title: 'Essential Nutrients: N-P-K and Micronutrients',
        text: [
          `Nitrogen (N), phosphorus (P), and potassium (K) are the primary macronutrients.
Nitrogen is the key driver of vegetative growth; its deficiency causes yellowing of older
leaves (chlorosis). Phosphorus drives root development, flowering, and seed production.
Potassium regulates water relations, disease resistance, and grain filling.`,
          `Secondary macronutrients — calcium, magnesium, and sulphur — are required in smaller
amounts but remain essential. Calcium is critical for cell wall integrity and fruit quality.
Magnesium is the central atom in chlorophyll, while sulphur is a component of amino acids
and improves oil quality in oilseed crops.`,
          `Micronutrients — iron, zinc, manganese, boron, copper, molybdenum, and chlorine —
are needed in trace amounts but cause severe deficiencies when absent. Zinc deficiency is
the most widespread micronutrient problem in Indian soils, affecting rice, wheat, and maize.
Application of zinc sulphate at 25 kg/hectare corrects deficiency and improves grain yield
by 15–30%. Boron deficiency in oilseeds and horticultural crops is the second most common.`,
        ],
      },
      {
        num: '2.4', title: 'Organic Matter and Composting',
        text: [
          `Organic matter is the lifeblood of productive soil. It feeds the billions of bacteria,
fungi, and other organisms that decompose plant residues, fix nitrogen, and cycle nutrients.
Soils with 2–3% organic matter typically produce 20–30% higher yields than soils with less
than 1% organic matter, even when chemical fertilisers are applied.`,
          `Composting converts farm waste — crop residues, animal manure, kitchen waste — into
stable humus over 4–8 weeks of aerobic decomposition. Turning the pile every 5–7 days
maintains oxygen levels and accelerates decomposition. Compost is ready when it smells
earthy, looks dark brown, and no longer heats up spontaneously.`,
          `Vermicomposting uses earthworms to process organic waste. Worm castings contain
available nutrients and beneficial microorganisms. Application of 2–3 tonnes of
vermicompost per hectare improves soil structure, water retention, and biological activity,
with effects lasting 2–3 seasons. The National Mission for Sustainable Agriculture (NMSA)
subsidises composting infrastructure for farmer groups.`,
        ],
      },
    ],
  },
  {
    num: 3, title: 'Major Cereal Crops',
    sections: [
      {
        num: '3.1', title: 'Rice (Paddy) Cultivation',
        text: [
          `Rice is the staple food of over 65% of India's population and is cultivated across
44 million hectares. India is both the world's second-largest producer and a major exporter
of basmati rice varieties. It is primarily a kharif crop in the Gangetic Plain and a
year-round crop in coastal states including West Bengal, Odisha, Andhra Pradesh, and
Tamil Nadu.`,
          `Transplanted paddy — where seedlings are raised in nurseries and then planted in
puddled fields — is the most common production method. Puddling creates a hardpan that
reduces water percolation and weed pressure. Water depth is maintained at 5–7 cm during
vegetative growth, then drained before panicle initiation to improve aeration.`,
          `High-yielding varieties from IRRI and ICAR programs now dominate most regions.
Swarna, MTU-7029, and Pusa Basmati-1 are among the most widely grown. Direct Seeded Rice
(DSR), where seeds are sown directly into moist or dry soil without transplanting, is
gaining popularity for its 20–30% labour savings and reduced greenhouse gas emissions.`,
        ],
      },
      {
        num: '3.2', title: 'Wheat Production Systems',
        text: [
          `Wheat is India's second most important food grain, cultivated across 30 million
hectares primarily in Punjab, Haryana, Uttar Pradesh, and Madhya Pradesh. It is a rabi
crop, sown in October–November and harvested in March–April. The Indo-Gangetic Plain,
with its fertile soils, cool winters, and canal irrigation, represents the heartland
of Indian wheat production.`,
          `Green Revolution varieties transformed wheat yields from under 1 tonne to over
3 tonnes per hectare between the 1960s and 1980s. Modern varieties HD-3086, WH-1105,
and GW-322 now exceed 5 tonnes/ha under optimal conditions. Disease-resistant varieties
are essential as wheat rust — yellow, brown, and black rust — remains a significant
biosecurity threat requiring ongoing vigilance.`,
          `Precision wheat cultivation involves optimal sowing dates (15 Oct–15 Nov in Punjab),
balanced fertilisation (120-60-40 kg N-P-K/ha), and 4–6 irrigations at critical growth
stages: crown root initiation, tillering, jointing, booting, heading, and grain filling.
Laser land levelling, which achieves 95% irrigation efficiency by eliminating surface
undulations, has been widely adopted across the wheat belt.`,
        ],
      },
      {
        num: '3.3', title: 'Maize and Corn Farming',
        text: [
          `Maize has emerged as one of the fastest-growing crops in India, expanding from 6 to
9 million hectares over the past two decades. It is used for food, animal feed, starch,
oil, and as feedstock for ethanol production. Karnataka, Andhra Pradesh, Telangana, and
Bihar are the major producing states, with a second crop grown in winter under irrigation.`,
          `Maize is a C4 plant with high photosynthetic efficiency; it produces more dry matter
per unit of water and sunlight than wheat or rice. Hybrid varieties from Pioneer, Dekalb,
and Bayer dominate commercial cultivation, with yields of 6–8 tonnes/ha achievable under
irrigated conditions. Maize responds strongly to nitrogen; split applications at sowing,
knee-high, and tasselling maximise yield.`,
          `Maize is highly sensitive to waterlogging — even 24 hours of standing water at the
knee-high stage can reduce yields by 30%. Drainage is therefore as important as irrigation.
Post-harvest drying to below 14% moisture content is essential to prevent mycotoxin
contamination during storage. Aflatoxin contamination from Aspergillus flavus is a
particular concern in warm, humid storage conditions.`,
        ],
      },
    ],
  },
  {
    num: 4, title: 'Commercial and Cash Crops',
    sections: [
      {
        num: '4.1', title: 'Sugarcane Cultivation',
        text: [
          `Sugarcane is India's most important industrial crop, occupying 5 million hectares and
supporting a sugar industry with over 500 mills. Uttar Pradesh, Maharashtra, Karnataka,
and Tamil Nadu account for 90% of production. India is the world's largest producer of
sugarcane and the second-largest producer of sugar.`,
          `Sugarcane is a perennial grass cultivated as an annual or ratoon crop. Planting is done
using two-bud or three-bud stem cuttings. The crop takes 10–12 months to mature for plant
cane and 8–10 months for ratoon. Drip irrigation in sugarcane saves 40–50% water and
increases sugar yield by 15–20% compared to furrow irrigation.`,
          `Sugar recovery — the percentage of sugar extracted from cane — is the key quality
parameter. Indian varieties average 10–11% recovery, below the global best of 14–15%.
Varieties Co-0238 (Karan 4) and CoSe-01434 are high-yielding, high-recovery varieties
recommended for the subtropical north. Timely harvesting at peak sucrose content, before
ratoon deterioration, is critical for maximising mill recovery.`,
        ],
      },
      {
        num: '4.2', title: 'Cotton Farming',
        text: [
          `Cotton, the "white gold" of agriculture, is grown on 12 million hectares across India.
Maharashtra, Gujarat, Telangana, Andhra Pradesh, and Punjab are the leading states. India
is the world's largest producer of cotton, accounting for 25% of global output, with exports
contributing significantly to agricultural trade revenue.`,
          `Bt cotton — genetically modified to express Bacillus thuringiensis proteins toxic to
bollworms — now dominates over 90% of Indian cotton area. Its adoption from 2002 dramatically
reduced insecticide applications and increased yields from 300 to over 500 kg/ha of lint.
However, secondary pests like whitefly and pink bollworm have emerged, requiring updated
IPM strategies.`,
          `Cotton requires a frost-free growing season, moderate rainfall (700–1200 mm), and
well-drained soils. Excess moisture at boll development causes shedding and reduced lint
quality. Pick timing is critical — early picking captures immature bolls with lower fibre
quality, while delayed picking allows weathering and fibre degradation. Most cotton is
hand-picked in India, providing substantial rural employment.`,
        ],
      },
      {
        num: '4.3', title: 'Jute and Fibre Crops',
        text: [
          `Jute is the world's second most important natural fibre after cotton, cultivated primarily
in the humid delta regions of West Bengal, Bihar, and Assam. India and Bangladesh together
produce over 90% of the world's jute. The crop is a kharif annual that matures in 100–120
days from sowing in March–April during the pre-monsoon period.`,
          `Tossa jute (Corchorus olitorius) has largely replaced white jute (C. capsularis) due
to its higher yield and fibre quality. Improved varieties JRO-524 and JRO-8432 yield 25–30
quintals of dry fibre per hectare. After cutting, stalks are retted — submerged in slow-
moving water for 10–30 days to separate the fibre from the woody core through microbial
decomposition.`,
          `The jute sector employs over 4 million farmers and provides livelihoods to mill workers
across eastern India. Competition from synthetic fibres has reduced jute demand since the
1970s, but the industry is being revitalised through diversification into geotextiles,
biodegradable packaging, and composite materials — markets that value jute's natural,
sustainable, and biodegradable properties.`,
        ],
      },
    ],
  },
  {
    num: 5, title: 'Water and Irrigation Management',
    sections: [
      {
        num: '5.1', title: 'Irrigation Methods Compared',
        text: [
          `Irrigation efficiency — the fraction of applied water that reaches plant roots — varies
enormously across methods. Flood irrigation, the oldest and most common method in India,
achieves 40–50% efficiency; water wets the entire field, but half or more is lost to deep
percolation, runoff, and evaporation. Furrow irrigation improves this to 60–70% by directing
water along crop rows only.`,
          `Sprinkler irrigation distributes water as artificial rain through pressurised pipes and
rotating heads, achieving 70–85% efficiency. It is well-suited to vegetables, fodder crops,
and orchards on undulating land where surface irrigation is difficult. Mini-sprinklers and
micro-sprinklers deliver water more precisely in orchards and plantation crops.`,
          `Drip irrigation, delivering water directly to the root zone through emitters, achieves
90–95% efficiency. Government subsidies under the Pradhan Mantri Krishi Sinchayee Yojana
(PMKSY) cover 55–75% of installation cost for small and marginal farmers. Drip is mandated
for sugarcane, banana, pomegranate, and other high-value crops in Maharashtra and Gujarat
to ensure rational water use.`,
        ],
      },
      {
        num: '5.2', title: 'Drip and Sprinkler Irrigation',
        text: [
          `A drip irrigation system consists of a main supply line, sub-main lines, lateral pipes,
and drip emitters. Emitters are spaced according to crop geometry — 30–60 cm apart for
vegetables, 100–200 cm for orchards. Fertigation — delivering dissolved fertilisers through
the drip system — allows precise, frequent nutrition delivery at 30–50% reduced fertiliser
input compared to soil application.`,
          `Proper filtration is critical for drip systems; clogged emitters are the most common
failure. Sand and gravel filters remove physical particles; disc and screen filters trap
organic matter; chemical treatments prevent algae and bacterial biofilms. Flushing laterals
at the end of each irrigation cycle removes sediment and extends system life by several
years.`,
          `Solar-powered drip systems are increasingly popular in off-grid areas. A 3 HP solar
pump combined with a 1-hectare drip system costs approximately ₹2.5 lakhs, with payback
in 4–6 years through fuel savings and yield improvements. Smartphone-controlled systems
with soil moisture sensors allow remote monitoring and precision scheduling, reducing
water use by a further 15–20%.`,
        ],
      },
      {
        num: '5.3', title: 'Rainwater Harvesting Techniques',
        text: [
          `With over 70% of India's rainfall concentrated in 3–4 monsoon months, water harvesting
is essential for year-round crop production. Farm ponds — excavated basins that capture
runoff from fields and surrounding uplands — are the most common on-farm storage structure.
MGNREGS funds construction of ponds of 250–1,000 cubic metre capacity, supporting irrigation
of 0.4–1.0 hectares during dry months.`,
          `Check dams and percolation tanks in watershed areas recharge groundwater and support
lift irrigation during dry months. Community-managed watershed programmes in Rajasthan,
Maharashtra, and Andhra Pradesh have transformed water-scarce villages through networks
of field bunds, gully plugs, and percolation structures, dramatically reducing the risk of
total crop failure in drought years.`,
          `Roof water harvesting — collecting rainwater from buildings into underground cisterns —
supplements household water and kitchen gardens. In Rajasthan's arid zones, traditional
kunds (underground circular tanks) and tankas store monsoon water for 8–10 months of
household use. The Atal Bhujal Yojana, launched in 2019, funds community groundwater
management in seven water-stressed states.`,
        ],
      },
    ],
  },
  {
    num: 6, title: 'Pest and Disease Management',
    sections: [
      {
        num: '6.1', title: 'Integrated Pest Management (IPM)',
        text: [
          `Integrated Pest Management (IPM) is a decision-based approach that uses multiple
complementary tactics to keep pest populations below economically damaging levels while
minimising risks to human health, beneficial organisms, and the environment. It moves beyond
"spray-on-schedule" approaches to thoughtful, threshold-based interventions.`,
          `The IPM hierarchy begins with prevention: choosing resistant varieties, rotating crops,
adjusting sowing dates to avoid peak pest periods, and maintaining field hygiene. Monitoring
— regular scouting to identify pest species and population levels — allows decisions based
on actual conditions. Economic thresholds guide spray decisions; for example, 2 stem borers
per m² in rice justifies intervention.`,
          `Biological controls — natural enemies including parasitic wasps, predatory beetles, and
entomopathogenic fungi — are first-line defensive tools in IPM. Release of Trichogramma
egg parasitoids against bollworm is standard in cotton IPM. Biopesticides based on Bacillus
thuringiensis (Bt), Beauveria bassiana, and Metarhizium anisopliae are effective against
caterpillars and soil insects with minimal environmental impact.`,
        ],
      },
      {
        num: '6.2', title: 'Common Pests and Diseases',
        text: [
          `Among insect pests, the stem borer complex causes the greatest yield losses across
cereal crops. Yellow stem borer (Scirpophaga incertulas) is the key pest of rice, causing
"dead heart" in the vegetative phase and "white ear" at heading — yield losses of 10–30%
are common in unprotected crops. Chilo suppressalis attacks maize and sorghum similarly.`,
          `Aphids, whiteflies, and thrips are vectors of plant viruses. Begomoviruses transmitted
by whiteflies cause tomato leaf curl, cassava mosaic, and cotton leaf curl. Controlling the
vector before virus spread begins is far more effective than treating infected plants, which
cannot recover. Yellow sticky traps and pheromone traps are valuable monitoring tools.`,
          `Fungal diseases cause enormous losses globally. Rice blast (Magnaporthe oryzae), wheat
rust (Puccinia spp.), and late blight of potato (Phytophthora infestans) are the most
destructive. Early detection through field scouting combined with timely fungicide
application limits disease spread. Climate-based disease forecasting systems from ICAR
alert farmers to high-risk periods before visible symptoms appear.`,
        ],
      },
      {
        num: '6.3', title: 'Pesticide Use and Safety',
        text: [
          `Pesticides save enormous quantities of food that would otherwise be lost to pests, but
their misuse creates serious risks. Acute poisoning, chronic health effects, environmental
contamination, and pest resistance are the main concerns. India reports the highest rates
of pesticide poisoning deaths in the world, primarily from organophosphates and carbamates
used without adequate protection.`,
          `Safe pesticide use requires reading and following label instructions, wearing appropriate
personal protective equipment (gloves, goggles, mask, and protective clothing), and
avoiding application during windy conditions or when bees are foraging. Pre-harvest
intervals — the minimum time between last application and harvest — must be respected to
prevent harmful residues in food reaching consumers.`,
          `Resistance management is increasingly critical. Rotating between pesticide classes with
different modes of action prevents resistance development. Limiting applications to the
minimum necessary and avoiding sub-lethal doses are key principles. The Insecticide
Resistance Action Committee (IRAC) classifies insecticides by mode of action to facilitate
rotation planning for farmers and agri-input dealers.`,
        ],
      },
    ],
  },
  {
    num: 7, title: 'Farm Risk Management',
    sections: [
      {
        num: '7.1', title: 'Identifying Agricultural Risks',
        text: [
          `Agriculture faces risks from multiple sources simultaneously. Production risks arise
from weather variability, pest outbreaks, and equipment failure. Price risks stem from
commodity market fluctuations that can undermine profitability even when yields are good.
Institutional risks include policy changes, input supply disruptions, and credit access
difficulties.`,
          `Risk assessment begins by identifying which risks are most relevant to a specific farm
based on its location, crop mix, and financial position. A farm in a drought-prone area
faces different risks than one near a river prone to flooding. High-value horticultural
crops face different price risks than commodity grains with assured procurement under
Minimum Support Prices (MSP).`,
          `Risk mapping tools, available through state agricultural departments and digital
platforms, allow farmers to visualise their exposure to weather risks based on historical
data. Crop simulation models predict the probability of yield loss given different rainfall
scenarios, informing irrigation investment and insurance purchase decisions. The NICRA
project has produced district-level vulnerability assessments for all of India.`,
        ],
      },
      {
        num: '7.2', title: 'Weather Risk and Crop Insurance',
        text: [
          `Pradhan Mantri Fasal Bima Yojana (PMFBY), launched in 2016, is the world's largest
crop insurance scheme by farmer enrolment. It covers yield losses from non-preventable risks
including drought, flood, hailstorm, cyclone, pests, and diseases. Farmers pay premiums of
only 1.5–2% of the sum insured for kharif crops; the balance is shared by state and central
governments.`,
          `Weather-based crop insurance (WBCIS) uses weather station data rather than crop-cutting
experiments to trigger payouts. When measured temperature or rainfall falls outside predefined
"strike" and "exit" limits during critical growth phases, compensation is automatically
triggered. This reduces administrative delay and lowers moral hazard compared to conventional
indemnity insurance.`,
          `Index-based insurance products linked to satellite vegetation indices (NDVI) are being
piloted in several states. These products cover remote areas without weather stations and
provide faster payouts. Digital platforms integrating weather data, crop models, and
financial products now offer farmers bundled packages of advisory and insurance services
through smartphone apps.`,
        ],
      },
      {
        num: '7.3', title: 'Market Price Risk and Mitigation',
        text: [
          `Commodity price volatility is an intrinsic challenge of farming. A farmer investing
₹30,000 per hectare in wheat cultivation faces uncertainty about the price at harvest six
months later. Minimum Support Prices (MSP) announced by the government before each sowing
season provide a floor price guarantee for 23 major crops, though procurement is effectively
available only in Punjab, Haryana, and a few other states.`,
          `Forward contracts with buyers — food processing companies, mandis, or export houses —
provide price certainty before harvest. Contract farming agreements specify price, quality,
and volume. Farmers gain price assurance; buyers secure supply. However, price risk can
shift back to farmers when buyers default during price downturns, a problem that has
affected several large contract farming programmes.`,
          `Farmers' Producer Organisations (FPOs) aggregate small farmers' produce to negotiate
better prices, access organised markets, and reduce intermediary margins. The government
has targeted establishment of 10,000 new FPOs by 2024, with financial support of ₹15 lakh
each over five years. Digital platforms — eNAM, ReMS, and Agrimarket — provide price
discovery and market access that was previously available only to large-scale farmers.`,
        ],
      },
      {
        num: '7.4', title: 'Diversification and Resilience Strategies',
        text: [
          `Diversification is the oldest and most robust risk management strategy. Growing multiple
crops — or combining crops with dairy, poultry, or aquaculture — means that a failure in
one enterprise rarely causes total farm income collapse. Intercropping maize with legumes,
or integrating fish culture with rice paddies, produces multiple income streams from the
same land area.`,
          `Crop diversification should be planned based on market demand and farm resources. Moving
into high-value vegetables or spices can dramatically increase farm income, but requires
cultivation skills, market connections, and tolerance for higher production costs. Women-led
groups in the SHG movement have successfully diversified into vegetables, mushrooms, and
spices with support from NABARD-funded programmes.`,
          `Building financial resilience through savings, reducing debt, and maintaining credit
access provides a buffer for bad years. Kisan Credit Cards offer revolving credit for input
purchases at 4% interest after government interest subvention. Digital lending platforms
are extending formal financial services to previously underserved small and marginal farmers,
reducing reliance on exploitative informal moneylenders who charge 24–60% annual interest.`,
        ],
      },
    ],
  },
];

// ─── Page number estimates (cover=1, toc=2, content starts at 3) ─────────────
// These are pre-calculated based on content volume.  ±1 page accuracy is fine;
// pageIndex uses fuzzy matching for TOC verification.
const CHAPTER_PAGES = [3, 8, 14, 19, 24, 29, 33];

// ─── Helper: draw horizontal rule ────────────────────────────────────────────
function rule(doc) {
  doc.moveTo(doc.page.margins.left, doc.y)
     .lineTo(doc.page.width - doc.page.margins.right, doc.y)
     .strokeColor(RULE).lineWidth(0.5).stroke()
     .strokeColor(DARK).lineWidth(1)
     .moveDown(0.4);
}

// ─── Helper: dot leader + page number ────────────────────────────────────────
function tocLine(doc, label, pageNum, indent = 0) {
  const L = doc.page.margins.left + indent;
  const R = doc.page.width - doc.page.margins.right;
  const usable = R - L;

  const pStr = String(pageNum);
  const pW   = doc.widthOfString(pStr);
  const lblW = doc.widthOfString(label);
  const dotsW = usable - lblW - pW - 8;
  const dotUnit = doc.widthOfString('.');
  const dots = dotsW > 0 ? '.'.repeat(Math.max(3, Math.floor(dotsW / dotUnit))) : '...';

  const y = doc.y;
  doc.text(label, L, y, { lineBreak: false });
  doc.text(dots, L + lblW + 4, y, { lineBreak: false });
  doc.text(pStr, R - pW, y, { lineBreak: false });
  doc.moveDown(0.55);
}

// ─── Generate PDF ─────────────────────────────────────────────────────────────
async function generate() {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 72, bottom: 72, left: 72, right: 72 },
    info: {
      Title: 'Crop Production and Farm Management: A Complete Guide',
      Author: 'Agricultural Extension Division',
      Subject: 'Modern farming practices, crop management, soil science',
      Keywords: 'farming, crops, soil, irrigation, pest management, risk',
    },
  });

  doc.pipe(fs.createWriteStream(OUT));

  // ── Cover page ───────────────────────────────────────────────────────────────
  doc.rect(0, 0, doc.page.width, doc.page.height).fill('#f0fdf4');

  const cx = doc.page.width / 2;

  // Green banner
  doc.rect(0, 180, doc.page.width, 6).fill(GREEN);

  doc.fillColor(GREEN)
     .fontSize(28).font('Helvetica-Bold')
     .text('Crop Production and', 72, 210, { align: 'center' })
     .text('Farm Management', { align: 'center' });

  doc.rect(0, doc.y + 10, doc.page.width, 4).fill(GREEN);

  doc.fillColor(DARK).fontSize(16).font('Helvetica')
     .text('A Complete Guide for Modern Farmers', 72, doc.y + 30, { align: 'center' });

  doc.moveDown(6).fillColor(MUTED).fontSize(11)
     .text('Agricultural Extension Division', { align: 'center' })
     .text('Covering: Soil Science · Cereal Crops · Cash Crops', { align: 'center' })
     .text('Irrigation · Pest Management · Risk Strategies', { align: 'center' });

  doc.moveDown(2).fillColor(MUTED).fontSize(9)
     .text('7 Chapters  ·  28 Sections  ·  Comprehensive Reference', { align: 'center' });

  // Green footer band
  doc.rect(0, doc.page.height - 60, doc.page.width, 60).fill(GREEN);
  doc.fillColor('#ffffff').fontSize(10)
     .text('For demonstration use with react-native-pageindex', 72, doc.page.height - 38,
           { align: 'center' });

  // ── Table of Contents page ────────────────────────────────────────────────────
  doc.addPage();

  doc.fillColor(GREEN).fontSize(20).font('Helvetica-Bold')
     .text('Table of Contents', { align: 'left' });
  doc.moveDown(0.3);
  rule(doc);
  doc.moveDown(0.3);

  CHAPTERS.forEach((ch, ci) => {
    const chLabel = `Chapter ${ch.num}: ${ch.title}`;
    doc.fillColor(DARK).fontSize(12).font('Helvetica-Bold');
    tocLine(doc, chLabel, CHAPTER_PAGES[ci]);

    ch.sections.forEach(sec => {
      doc.fillColor(MUTED).fontSize(10).font('Helvetica');
      tocLine(doc, `${sec.num}  ${sec.title}`, CHAPTER_PAGES[ci] + ch.sections.indexOf(sec), 18);
    });

    doc.moveDown(0.4);
  });

  rule(doc);
  doc.fillColor(MUTED).fontSize(9).font('Helvetica')
     .text('Page numbers are approximate. Actual page may vary by ±1.',
           { align: 'right' });

  // ── Chapter pages ─────────────────────────────────────────────────────────────
  CHAPTERS.forEach(ch => {
    doc.addPage();

    // Chapter header banner
    doc.rect(72, doc.y, doc.page.width - 144, 2).fill(GREEN);
    doc.moveDown(0.4);

    doc.fillColor(GREEN).fontSize(16).font('Helvetica-Bold')
       .text(`Chapter ${ch.num}`, { continued: true })
       .fillColor(DARK)
       .text(`  ${ch.title}`);

    doc.moveDown(0.2);
    rule(doc);
    doc.moveDown(0.6);

    ch.sections.forEach(sec => {
      // Section heading
      doc.fillColor(GREEN).fontSize(13).font('Helvetica-Bold')
         .text(`${sec.num}  ${sec.title}`);
      doc.moveDown(0.3);

      // Body paragraphs
      sec.text.forEach(para => {
        doc.fillColor(DARK).fontSize(11).font('Helvetica')
           .text(para.replace(/\n\s*/g, ' ').trim(), {
             align: 'justify',
             lineGap: 3,
           });
        doc.moveDown(0.8);
      });

      doc.moveDown(0.3);
    });
  });

  // ── Finalize ─────────────────────────────────────────────────────────────────
  doc.end();

  await new Promise((resolve, reject) => {
    doc.on('end', resolve);
    doc.on('error', reject);
  });

  console.log(`✅  Generated: ${OUT}`);
  console.log(`    Pages: ~${2 + CHAPTERS.length + CHAPTERS.reduce((s, c) => s + c.sections.length, 0)} (approx)`);
}

generate().catch(err => { console.error(err); process.exit(1); });
