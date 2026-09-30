/* =========================================================
   Therapeutic-area catalog
   Configuration, not data: indication names and query terms, and the public facts about each asset (INN, US brand,
   company, mechanism, development codes) that scope the live queries. Development status, labels, trials and
   literature all come from the sources at run time. The user picks a therapeutic area, a country, the indications
   and assets to watch, and their own products, in Watchlist (stored in the browser).
   One file, two callers: the browser (window.MIP_CATALOG) and proxy/refresh-snapshot.mjs (require), which builds the
   nightly snapshot for the default watchlist of one therapeutic area.

   Therapeutic area: { id, name, short, desc, fedTerms, specialties, inds, assets, guides, congresses, advocacy, themes, pros,
   endpoints, elig, gaps, pops }
     specialties  pattern for the NPPES taxonomy descriptions that fit the area (a tie-breaker when matching investigators to NPIs)
     inds    { id, name, short, abbr, syn, epmc (Europe PMC), ct (ClinicalTrials.gov condition), re (condition or text),
             not (exclusion), label (US label indication text), core (a key indication, charted by default) }
     assets  { id, name, short, brand (US, as openFDA), generic, company, moa, grp (landscape row), route, codes, inds,
             epmc, intr (ClinicalTrials.gov intervention), sponsor (lead-sponsor pattern), only (intervention names must
             match), labelRoute (openFDA route the label must carry), sibling (US brand of the same molecule by another
             route, removed from FAERS counts) }
     guides  [name, Europe PMC term, URL, regions]      congresses [abbr, name, URL]
     advocacy [name, kind, indication ids or ['*'], URL] themes / gaps [key?, label, Europe PMC query]
     endpoints / elig [pattern, label]                   pops [key, label, Europe PMC query, PubMed query]
   ========================================================= */
(function (root) {
  'use strict';
  var TAS = [
  {
      id: 'IDERM', name: 'Immunology & dermatology', short: 'Immuno-derm',
      desc: 'Inflammatory skin disease: psoriasis, atopic dermatitis and related conditions',
      fedTerms: ['dermatology'],
      specialties: 'dermatolog|allergy|immunolog',
      inds: [
        { id: 'PsO', name: 'Plaque psoriasis', short: 'psoriasis', abbr: ['pso'], syn: ['psoriasis'], epmc: '(psoriasis)', ct: 'psoriasis', re: /psoria/i, not: /arthrit|pustul|erythroderm/i, label: /plaque psoriasis/i, core: true },
        { id: 'AD', name: 'Atopic dermatitis', short: 'atopic dermatitis', abbr: ['ad'], syn: ['eczema', 'atopic eczema'], epmc: '("atopic dermatitis" OR "atopic eczema")', ct: 'atopic dermatitis', re: /atopic|^eczema$/i, not: /keratoconj/i, label: /atopic dermatitis/i, core: true },
        { id: 'SD', name: 'Seborrheic dermatitis', short: 'seborrheic dermatitis', abbr: ['sd', 'seb'], syn: ['seborrhoeic dermatitis'], epmc: '("seborrheic dermatitis" OR "seborrhoeic dermatitis")', ct: 'seborrheic dermatitis', re: /seborr/i, label: /seborr/i, core: true },
        { id: 'AA', name: 'Alopecia areata', short: 'alopecia areata', abbr: ['aa'], syn: [], epmc: '("alopecia areata")', ct: 'alopecia areata', re: /alopecia areata/i, label: /alopecia areata/i },
        { id: 'HS', name: 'Hidradenitis suppurativa', short: 'hidradenitis suppurativa', abbr: ['hs'], syn: ['acne inversa'], epmc: '("hidradenitis suppurativa")', ct: 'hidradenitis suppurativa', re: /hidradenitis/i, label: /hidradenitis/i },
        { id: 'VIT', name: 'Vitiligo', short: 'vitiligo', abbr: [], syn: [], epmc: '(vitiligo)', ct: 'vitiligo', re: /vitiligo/i, label: /vitiligo/i },
        { id: 'CHE', name: 'Chronic hand eczema', short: 'chronic hand eczema', abbr: ['che'], syn: ['hand dermatitis'], epmc: '("hand eczema" OR "hand dermatitis")', ct: 'hand eczema', re: /hand eczema|hand dermatitis/i, label: /hand eczema/i },
        { id: 'PN', name: 'Prurigo nodularis', short: 'prurigo nodularis', abbr: ['pn'], syn: [], epmc: '("prurigo nodularis")', ct: 'prurigo nodularis', re: /prurigo nodularis/i, label: /prurigo nodularis/i },
        { id: 'CSU', name: 'Chronic spontaneous urticaria', short: 'chronic spontaneous urticaria', abbr: ['csu'], syn: ['chronic urticaria'], epmc: '("chronic spontaneous urticaria" OR "chronic idiopathic urticaria")', ct: 'chronic spontaneous urticaria', re: /spontaneous urticaria|idiopathic urticaria/i, label: /spontaneous urticaria|idiopathic urticaria/i }
      ],
      assets: [
        { id: 'roflumilast', name: 'Roflumilast (topical)', short: 'Roflumilast', brand: 'ZORYVE', company: 'Arcutis', moa: 'PDE4 inhibitor', grp: 'PDE4', route: 'Topical', codes: ['ARQ-151', 'ARQ-154'], inds: ['PsO', 'AD', 'SD'], epmc: '(roflumilast AND (cream OR foam OR topical OR psoriasis OR "atopic dermatitis" OR "seborrheic dermatitis"))', intr: 'roflumilast OR ARQ-151 OR ARQ-154', sponsor: 'arcutis', labelRoute: 'TOPICAL', sibling: 'DALIRESP' },
        { id: 'tapinarof', name: 'Tapinarof', brand: 'VTAMA', company: 'Organon', moa: 'AhR agonist', grp: 'AhR', route: 'Topical', codes: ['benvitimod'], inds: ['PsO', 'AD'], sponsor: 'dermavant|organon|glaxo|gsk', labelRoute: 'TOPICAL' },
        { id: 'ruxcream', name: 'Ruxolitinib cream', brand: 'OPZELURA', generic: 'ruxolitinib', company: 'Incyte', moa: 'JAK1/JAK2 inhibitor', grp: 'JAK', route: 'Topical', inds: ['AD', 'VIT', 'HS'], epmc: '("ruxolitinib cream" OR (ruxolitinib AND (topical OR cream)))', intr: 'ruxolitinib', only: /cream|topical/i, sponsor: 'incyte', labelRoute: 'TOPICAL', sibling: 'JAKAFI' },
        { id: 'crisaborole', name: 'Crisaborole', brand: 'EUCRISA', company: 'Pfizer', moa: 'PDE4 inhibitor', grp: 'PDE4', route: 'Topical', codes: ['AN2728'], inds: ['AD'], sponsor: 'pfizer|anacor', labelRoute: 'TOPICAL' },
        { id: 'delgocitinib', name: 'Delgocitinib', brand: 'ANZUPGO', company: 'LEO Pharma', moa: 'Pan-JAK inhibitor', grp: 'JAK', route: 'Topical', inds: ['CHE'], sponsor: 'leo pharma|japan tobacco|torii', labelRoute: 'TOPICAL' },
        { id: 'dupilumab', name: 'Dupilumab', brand: 'DUPIXENT', company: 'Sanofi / Regeneron', moa: 'IL-4Rα antagonist', grp: 'IL-4R / IL-13', route: 'Injectable', inds: ['AD', 'PN', 'CSU', 'CHE'], sponsor: 'regeneron|sanofi' },
        { id: 'lebrikizumab', name: 'Lebrikizumab', brand: 'EBGLYSS', company: 'Lilly / Almirall', moa: 'IL-13 inhibitor', grp: 'IL-4R / IL-13', route: 'Injectable', inds: ['AD'], sponsor: 'lilly|dermira|almirall' },
        { id: 'tralokinumab', name: 'Tralokinumab', brand: 'ADBRY', company: 'LEO Pharma', moa: 'IL-13 inhibitor', grp: 'IL-4R / IL-13', route: 'Injectable', inds: ['AD'], sponsor: 'leo pharma|astrazeneca|medimmune' },
        { id: 'apg777', name: 'Zumilokibart (APG777)', short: 'APG777', generic: 'zumilokibart', company: 'Apogee', moa: 'IL-13 inhibitor, extended half-life', grp: 'IL-4R / IL-13', route: 'Injectable', codes: ['APG777'], inds: ['AD'], sponsor: 'apogee' },
        { id: 'nemolizumab', name: 'Nemolizumab', brand: 'NEMLUVIO', company: 'Galderma', moa: 'IL-31RA antagonist', grp: 'IL-31', route: 'Injectable', inds: ['AD', 'PN'], sponsor: 'galderma|maruho|chugai' },
        { id: 'rocatinlimab', name: 'Rocatinlimab', company: 'Amgen / Kyowa Kirin', moa: 'Anti-OX40', grp: 'OX40 / OX40L', route: 'Injectable', codes: ['AMG 451', 'KHK4083'], inds: ['AD'], sponsor: 'amgen|kyowa' },
        { id: 'amlitelimab', name: 'Amlitelimab', company: 'Sanofi', moa: 'Anti-OX40 ligand', grp: 'OX40 / OX40L', route: 'Injectable', codes: ['SAR445229', 'KY1005'], inds: ['AD'], sponsor: 'sanofi|kymab' },
        { id: 'upadacitinib', name: 'Upadacitinib', brand: 'RINVOQ', company: 'AbbVie', moa: 'JAK1 inhibitor', grp: 'JAK', route: 'Oral', inds: ['AD', 'VIT', 'AA', 'HS'], sponsor: 'abbvie', labelRoute: 'ORAL' },
        { id: 'abrocitinib', name: 'Abrocitinib', brand: 'CIBINQO', company: 'Pfizer', moa: 'JAK1 inhibitor', grp: 'JAK', route: 'Oral', inds: ['AD'], sponsor: 'pfizer', labelRoute: 'ORAL' },
        { id: 'ritlecitinib', name: 'Ritlecitinib', brand: 'LITFULO', company: 'Pfizer', moa: 'JAK3 / TEC inhibitor', grp: 'JAK', route: 'Oral', inds: ['AA', 'VIT'], sponsor: 'pfizer', labelRoute: 'ORAL' },
        { id: 'apremilast', name: 'Apremilast', brand: 'OTEZLA', company: 'Amgen', moa: 'PDE4 inhibitor', grp: 'PDE4', route: 'Oral', inds: ['PsO'], sponsor: 'amgen|celgene', labelRoute: 'ORAL' },
        { id: 'orismilast', name: 'Orismilast', company: 'UNION therapeutics', moa: 'PDE4B/D inhibitor', grp: 'PDE4', route: 'Oral', inds: ['PsO', 'AD', 'HS'], sponsor: 'union', labelRoute: 'ORAL' },
        { id: 'deucravacitinib', name: 'Deucravacitinib', brand: 'SOTYKTU', company: 'BMS', moa: 'TYK2 inhibitor', grp: 'TYK2', route: 'Oral', inds: ['PsO'], sponsor: 'bristol', labelRoute: 'ORAL' },
        { id: 'zasocitinib', name: 'Zasocitinib', company: 'Takeda', moa: 'TYK2 inhibitor', grp: 'TYK2', route: 'Oral', codes: ['TAK-279', 'NDI-034858'], inds: ['PsO'], sponsor: 'takeda|nimbus', labelRoute: 'ORAL' },
        { id: 'esk001', name: 'Envudeucitinib (ESK-001)', short: 'ESK-001', generic: 'envudeucitinib', company: 'Alumis', moa: 'TYK2 inhibitor', grp: 'TYK2', route: 'Oral', codes: ['ESK-001'], inds: ['PsO'], sponsor: 'alumis', labelRoute: 'ORAL' },
        { id: 'icotrokinra', name: 'Icotrokinra', company: 'Johnson & Johnson', moa: 'Oral IL-23R antagonist peptide', grp: 'IL-23 / IL-17', route: 'Oral', codes: ['JNJ-2113', 'JNJ-77242113'], inds: ['PsO'], intr: 'icotrokinra OR "JNJ-77242113"', sponsor: 'janssen|johnson', labelRoute: 'ORAL' },
        { id: 'bimekizumab', name: 'Bimekizumab', brand: 'BIMZELX', company: 'UCB', moa: 'IL-17A/F inhibitor', grp: 'IL-23 / IL-17', route: 'Injectable', inds: ['PsO', 'HS'], sponsor: 'ucb' },
        { id: 'secukinumab', name: 'Secukinumab', brand: 'COSENTYX', company: 'Novartis', moa: 'IL-17A inhibitor', grp: 'IL-23 / IL-17', route: 'Injectable', inds: ['PsO', 'HS'], sponsor: 'novartis' },
        { id: 'risankizumab', name: 'Risankizumab', brand: 'SKYRIZI', company: 'AbbVie', moa: 'IL-23p19 inhibitor', grp: 'IL-23 / IL-17', route: 'Injectable', inds: ['PsO'], sponsor: 'abbvie|boehringer' },
        { id: 'guselkumab', name: 'Guselkumab', brand: 'TREMFYA', company: 'Johnson & Johnson', moa: 'IL-23p19 inhibitor', grp: 'IL-23 / IL-17', route: 'Injectable', inds: ['PsO'], sponsor: 'janssen|johnson' },
        { id: 'remibrutinib', name: 'Remibrutinib', brand: 'RHAPSIDO', company: 'Novartis', moa: 'BTK inhibitor', grp: 'BTK', route: 'Oral', codes: ['LOU064'], inds: ['CSU', 'HS'], sponsor: 'novartis', labelRoute: 'ORAL' },
        { id: 'omalizumab', name: 'Omalizumab', brand: 'XOLAIR', company: 'Genentech / Novartis', moa: 'Anti-IgE', grp: 'IgE', route: 'Injectable', inds: ['CSU'], sponsor: 'genentech|novartis|roche' }
      ],
      guides: [
        ['American Academy of Dermatology', '("American Academy of Dermatology" OR AAD)', 'https://www.aad.org/member/clinical-quality/guidelines', ['US']],
        ['National Psoriasis Foundation', '"National Psoriasis Foundation"', 'https://www.psoriasis.org/', ['US']],
        ['AAAAI / ACAAI Joint Task Force', '("Joint Task Force" OR "American Academy of Allergy, Asthma")', 'https://www.aaaai.org/', ['US']],
        ['Canadian Dermatology Association', '"Canadian Dermatology Association"', 'https://dermatology.ca/', ['CA']],
        ['British Association of Dermatologists', '"British Association of Dermatologists"', 'https://www.bad.org.uk/guidelines-and-standards/clinical-guidelines/', ['GB']],
        ['EuroGuiDerm (European Dermatology Forum)', '(EuroGuiDerm OR "European Dermatology Forum")', 'https://www.guidelines.edf.one/', ['EU']],
        ['Société Française de Dermatologie', '"Société Française de Dermatologie"', 'https://www.sfdermato.org/', ['FR']],
        ['SIDeMaST', 'SIDeMaST', 'https://www.sidemast.org/', ['IT']],
        ['AEDV', '(AEDV OR "Academia Española de Dermatología")', 'https://aedv.es/', ['ES']],
        ['Japanese Dermatological Association', '"Japanese Dermatological Association"', 'https://www.dermatol.or.jp/', ['JP']],
        ['Australasian College of Dermatologists', '"Australasian College of Dermatologists"', 'https://www.dermcoll.edu.au/', ['AU']]
      ],
      congresses: [
        ['AAD', 'American Academy of Dermatology Annual Meeting', 'https://www.aad.org/member/meetings-education/am'],
        ['EADV', 'European Academy of Dermatology and Venereology', 'https://eadv.org/congress/'],
        ['SID', 'Society for Investigative Dermatology', 'https://www.sidnet.org/'],
        ['ESDR', 'European Society for Dermatological Research', 'https://www.esdr.org/'],
        ['RAD', 'Revolutionizing Atopic Dermatitis', 'https://revolutionizingad.com/'],
        ['Fall Clinical', 'Fall Clinical Dermatology Conference', 'https://fallclinical.com/'],
        ['Winter Clinical', 'Winter Clinical Dermatology Conference', 'https://winterclinical.com/'],
        ['Maui Derm', 'Maui Derm', 'https://mauiderm.com/'],
        ['SPD', 'Society for Pediatric Dermatology', 'https://pedsderm.net/'],
        ['BAD', 'British Association of Dermatologists', 'https://www.bad.org.uk/'],
        ['WCD', 'World Congress of Dermatology', 'https://www.ilds.org/'],
        ['Skin of Color Society', 'Skin of Color Society Scientific Symposium', 'https://skinofcolorsociety.org/']
      ],
      advocacy: [
        ['National Eczema Association', 'Patient advocacy', ['AD', 'CHE'], 'https://nationaleczema.org'],
        ['National Psoriasis Foundation', 'Patient advocacy', ['PsO'], 'https://www.psoriasis.org'],
        ['National Alopecia Areata Foundation', 'Patient advocacy', ['AA'], 'https://www.naaf.org'],
        ['HS Foundation', 'Patient advocacy', ['HS'], 'https://www.hs-foundation.org'],
        ['Global Vitiligo Foundation', 'Patient advocacy', ['VIT'], 'https://globalvitiligofoundation.org'],
        ['Skin of Color Society', 'Professional society', ['*'], 'https://skinofcolorsociety.org'],
        ['GlobalSkin (IADPO)', 'Patient organization network', ['*'], 'https://globalskin.org']
      ],
      themes: [
        ['Itch and sleep outcomes', '(itch OR pruritus OR "sleep disturbance")'],
        ['Pediatric use under 6 years', '(infant* OR toddler* OR "under 6" OR "2 to 5 years" OR "younger than 6")'],
        ['Skin of color and equity', '("skin of color" OR "skin of colour" OR Fitzpatrick OR "racial and ethnic" OR "health equity")'],
        ['Steroid-sparing regimens', '("steroid-sparing" OR "steroid sparing" OR "topical corticosteroid use")'],
        ['Oral TYK2 and IL-23 peptides', '(TYK2 OR "tyrosine kinase 2" OR "oral peptide" OR "IL-23 receptor antagonist")'],
        ['OX40 pathway', '(OX40 OR OX40L)'],
        ['Scalp and sensitive areas', '(scalp OR intertriginous OR facial OR genital OR "sensitive areas")']
      ],
      pros: ['DLQI', 'CDLQI', 'POEM', 'Itch NRS', 'PP-NRS', 'EQ-5D', 'PSSD', 'Skindex', 'Sleep NRS', 'PGI'],
      endpoints: [[/vIGA|IGA|PGA|sPGA|global assessment/i, 'IGA / PGA success'], [/PASI/i, 'PASI'], [/EASI/i, 'EASI'], [/itch|pruritus|NRS/i, 'Itch NRS'], [/SCORAD/i, 'SCORAD'], [/SALT/i, 'SALT (hair regrowth)'], [/HiSCR/i, 'HiSCR'], [/VASI/i, 'VASI'], [/BSA|body surface/i, 'BSA'], [/HECSI|hand eczema/i, 'HECSI'], [/UAS7/i, 'UAS7']],
      elig: [[/BSA/i, 'BSA threshold'], [/IGA|PGA/i, 'Severity by IGA or PGA'], [/EASI/i, 'EASI threshold'], [/PASI/i, 'PASI threshold'], [/phototherapy/i, 'Phototherapy rules'], [/topical corticosteroid|TCS/i, 'Topical corticosteroid rules']],
      gaps: [
        ['face', 'Face and intertriginous', '(face OR facial OR intertriginous OR genital OR "sensitive areas" OR "skin folds")'],
        ['scalp', 'Scalp', 'scalp'],
        ['soc', 'Skin of color', '("skin of color" OR "skin of colour" OR Fitzpatrick OR "Black patients" OR Hispanic OR race OR ethnicity)'],
        ['itch', 'Itch and sleep', '(itch OR pruritus OR sleep)']
      ],
      pops: [['soc', 'Skin of color', '("skin of color" OR "skin of colour" OR Fitzpatrick)', '"skin of color"[tiab] OR fitzpatrick[tiab]']]
    },
  {
      id: 'ONC', name: 'Oncology: solid tumors', short: 'Solid tumors',
      desc: 'Solid tumor oncology: lung, breast, prostate, GI, GU, gynecologic, melanoma and head and neck cancers',
      fedTerms: ['oncology'],
      specialties: 'oncolog|hematolog|radiation|surg|urolog',
      inds: [
        { id: 'NSCLC', name: 'Non-small cell lung cancer', short: 'non-small cell lung cancer', abbr: ['nsclc'], syn: ['lung cancer', 'lung adenocarcinoma', 'non small cell lung cancer'], epmc: '("non-small cell lung cancer" OR "non-small-cell lung cancer" OR NSCLC)', ct: 'non-small cell lung cancer', re: /non[- ]?small[- ]?cell lung|\bNSCLC\b/i, label: /non-small cell lung cancer|\bNSCLC\b/i, core: true },
        { id: 'BC', name: 'Breast cancer', short: 'breast cancer', abbr: ['bc', 'mbc', 'ebc', 'tnbc'], syn: ['breast carcinoma', 'hr+ breast cancer', 'her2+ breast cancer', 'triple-negative breast cancer'], epmc: '("breast cancer" OR "breast carcinoma")', ct: 'breast cancer', re: /breast (cancer|carcinoma|neoplasm|tumou?r)|\bTNBC\b/i, label: /breast cancer/i, core: true },
        { id: 'PC', name: 'Prostate cancer', short: 'prostate cancer', abbr: ['pc', 'mcrpc', 'nmcrpc', 'mhspc', 'mcspc'], syn: ['prostate carcinoma', 'castration-resistant prostate cancer', 'hormone-sensitive prostate cancer'], epmc: '("prostate cancer" OR "prostate carcinoma" OR mCRPC OR mHSPC)', ct: 'prostate cancer', re: /prostat(e|ic) (cancer|carcinoma|adenocarcinoma|neoplasm)|\b(m|nm)?CRPC\b|\bm?[HC]SPC\b/i, label: /prostate cancer/i, core: true },
        { id: 'CRC', name: 'Colorectal cancer', short: 'colorectal cancer', abbr: ['crc', 'mcrc'], syn: ['colon cancer', 'rectal cancer', 'bowel cancer'], epmc: '("colorectal cancer" OR "colorectal carcinoma" OR "colon cancer" OR "rectal cancer")', ct: 'colorectal cancer', re: /colorectal|colon (cancer|carcinoma|adenocarcinoma)|rectal (cancer|carcinoma|adenocarcinoma)|\bmCRC\b/i, label: /colorectal cancer/i },
        { id: 'MEL', name: 'Melanoma', short: 'melanoma', abbr: ['mel'], syn: ['cutaneous melanoma', 'malignant melanoma'], epmc: '(melanoma)', ct: 'melanoma', re: /melanoma/i, not: /uveal|ocular|choroidal/i, label: /melanoma/i },
        { id: 'URO', name: 'Urothelial / bladder cancer', short: 'urothelial cancer', abbr: ['uc', 'mibc', 'nmibc', 'muc'], syn: ['bladder cancer', 'urothelial carcinoma', 'transitional cell carcinoma'], epmc: '("urothelial carcinoma" OR "urothelial cancer" OR "bladder cancer")', ct: 'urothelial carcinoma', re: /urothelial|bladder (cancer|carcinoma|neoplasm|tumou?r)|transitional cell carcinoma|\bN?MIBC\b/i, label: /urothelial|bladder cancer/i },
        { id: 'RCC', name: 'Renal cell carcinoma', short: 'renal cell carcinoma', abbr: ['rcc', 'ccrcc'], syn: ['kidney cancer', 'renal cancer', 'clear cell renal cell carcinoma'], epmc: '("renal cell carcinoma" OR "kidney cancer")', ct: 'renal cell carcinoma', re: /renal cell|kidney cancer|renal (cancer|carcinoma)|\bRCC\b/i, label: /renal cell carcinoma/i },
        { id: 'HCC', name: 'Hepatocellular carcinoma', short: 'hepatocellular carcinoma', abbr: ['hcc'], syn: ['liver cancer', 'hepatoma'], epmc: '("hepatocellular carcinoma" OR "liver cancer")', ct: 'hepatocellular carcinoma', re: /hepatocellular|\bHCC\b|liver cancer/i, label: /hepatocellular carcinoma/i },
        { id: 'GC', name: 'Gastric / GEJ cancer', short: 'gastric cancer', abbr: ['gc', 'gej', 'gejc'], syn: ['stomach cancer', 'gastric adenocarcinoma', 'gastroesophageal junction adenocarcinoma'], epmc: '("gastric cancer" OR "gastric adenocarcinoma" OR "gastroesophageal junction" OR "gastro-oesophageal junction" OR "stomach cancer")', ct: 'gastric cancer', re: /gastric (cancer|carcinoma|adenocarcinoma|neoplasm)|stomach (cancer|carcinoma|adenocarcinoma|neoplasm)|gastro-?o?esophageal junction|o?esophagogastric junction|\bGEJ\b/i, label: /gastric|gastroesophageal junction/i },
        { id: 'OC', name: 'Ovarian cancer', short: 'ovarian cancer', abbr: ['oc', 'hgsoc'], syn: ['ovarian carcinoma', 'fallopian tube cancer', 'primary peritoneal cancer'], epmc: '("ovarian cancer" OR "ovarian carcinoma" OR "fallopian tube cancer" OR "primary peritoneal cancer")', ct: 'ovarian cancer', re: /ovarian (cancer|carcinoma|neoplasm|tumou?r)|epithelial ovarian|fallopian tube (cancer|carcinoma)|primary peritoneal/i, label: /ovarian|fallopian tube|primary peritoneal/i },
        { id: 'HNSCC', name: 'Head and neck squamous cell carcinoma', short: 'head and neck cancer', abbr: ['hnscc', 'scchn'], syn: ['head and neck cancer', 'oropharyngeal cancer', 'oral cavity cancer', 'laryngeal cancer'], epmc: '("head and neck squamous cell carcinoma" OR "head and neck cancer" OR HNSCC OR SCCHN)', ct: 'head and neck squamous cell carcinoma', re: /head and neck|\bHNSCC\b|\bSCCHN\b|oropharyngeal (cancer|carcinoma|squamous)|laryngeal (cancer|carcinoma|squamous)|hypopharyngeal|oral cavity (cancer|carcinoma|squamous)/i, not: /nasopharyn|thyroid/i, label: /head and neck/i },
        { id: 'PDAC', name: 'Pancreatic cancer', short: 'pancreatic cancer', abbr: ['pdac'], syn: ['pancreatic adenocarcinoma', 'pancreatic ductal adenocarcinoma'], epmc: '("pancreatic cancer" OR "pancreatic ductal adenocarcinoma" OR "pancreatic adenocarcinoma" OR PDAC)', ct: 'pancreatic cancer', re: /pancreatic (cancer|carcinoma|adenocarcinoma|ductal)|pancreas (cancer|adenocarcinoma)|\bPDAC\b/i, not: /neuroendocrine/i, label: /pancreatic (adeno)?carcinoma|pancreatic cancer/i }
      ],
      assets: [
        { id: 'pembrolizumab', name: 'Pembrolizumab', brand: 'KEYTRUDA', company: 'Merck & Co. (MSD)', moa: 'Anti-PD-1 mAb', grp: 'PD-1 / PD-L1', route: 'Intravenous', codes: ['MK-3475'], inds: ['NSCLC', 'BC', 'CRC', 'MEL', 'URO', 'RCC', 'HCC', 'GC', 'OC', 'HNSCC'], sponsor: 'merck sharp|msd|merck' },
        { id: 'nivolumab', name: 'Nivolumab', brand: 'OPDIVO', company: 'BMS / Ono', moa: 'Anti-PD-1 mAb', grp: 'PD-1 / PD-L1', route: 'Intravenous', codes: ['BMS-936558', 'ONO-4538'], inds: ['NSCLC', 'MEL', 'URO', 'RCC', 'HCC', 'GC', 'CRC', 'HNSCC'], sponsor: 'bristol|ono pharma' },
        { id: 'atezolizumab', name: 'Atezolizumab', brand: 'TECENTRIQ', company: 'Roche / Genentech', moa: 'Anti-PD-L1 mAb', grp: 'PD-1 / PD-L1', route: 'Intravenous', codes: ['MPDL3280A'], inds: ['NSCLC', 'HCC', 'MEL'], sponsor: 'hoffmann|roche|genentech' },
        { id: 'durvalumab', name: 'Durvalumab', brand: 'IMFINZI', company: 'AstraZeneca', moa: 'Anti-PD-L1 mAb', grp: 'PD-1 / PD-L1', route: 'Intravenous', codes: ['MEDI4736'], inds: ['NSCLC', 'HCC', 'URO', 'GC'], sponsor: 'astrazeneca|medimmune' },
        { id: 'ipilimumab', name: 'Ipilimumab', brand: 'YERVOY', company: 'BMS', moa: 'Anti-CTLA-4 mAb', grp: 'CTLA-4', route: 'Intravenous', codes: ['MDX-010'], inds: ['MEL', 'RCC', 'NSCLC', 'HCC', 'CRC'], sponsor: 'bristol' },
        { id: 'trastuzumabderuxtecan', name: 'Trastuzumab deruxtecan', short: 'T-DXd', brand: 'ENHERTU', generic: 'trastuzumab deruxtecan', company: 'Daiichi Sankyo / AstraZeneca', moa: 'HER2-directed ADC (topoisomerase I payload)', grp: 'HER2', route: 'Intravenous', codes: ['DS-8201', 'T-DXd'], inds: ['BC', 'NSCLC', 'GC'], epmc: '("trastuzumab deruxtecan" OR T-DXd OR DS-8201 OR DS-8201a)', intr: '"trastuzumab deruxtecan" OR DS-8201', sponsor: 'daiichi|astrazeneca' },
        { id: 'zongertinib', name: 'Zongertinib', brand: 'HERNEXEOS', company: 'Boehringer Ingelheim', moa: 'HER2-selective TKI', grp: 'HER2', route: 'Oral', codes: ['BI 1810631'], inds: ['NSCLC'], sponsor: 'boehringer' },
        { id: 'osimertinib', name: 'Osimertinib', brand: 'TAGRISSO', company: 'AstraZeneca', moa: 'Third-generation EGFR TKI', grp: 'EGFR', route: 'Oral', codes: ['AZD9291'], inds: ['NSCLC'], sponsor: 'astrazeneca' },
        { id: 'amivantamab', name: 'Amivantamab', brand: 'RYBREVANT', company: 'Johnson & Johnson', moa: 'EGFR x MET bispecific antibody', grp: 'EGFR', route: 'Intravenous', codes: ['JNJ-61186372'], inds: ['NSCLC'], sponsor: 'janssen|johnson' },
        { id: 'sotorasib', name: 'Sotorasib', brand: 'LUMAKRAS', company: 'Amgen', moa: 'KRAS G12C inhibitor', grp: 'RAS / BRAF', route: 'Oral', codes: ['AMG 510'], inds: ['NSCLC', 'CRC'], sponsor: 'amgen' },
        { id: 'adagrasib', name: 'Adagrasib', brand: 'KRAZATI', company: 'BMS', moa: 'KRAS G12C inhibitor', grp: 'RAS / BRAF', route: 'Oral', codes: ['MRTX849'], inds: ['NSCLC', 'CRC'], sponsor: 'mirati|bristol' },
        { id: 'daraxonrasib', name: 'Daraxonrasib (RMC-6236)', short: 'Daraxonrasib', company: 'Revolution Medicines', moa: 'RAS(ON) multi-selective inhibitor', grp: 'RAS / BRAF', route: 'Oral', codes: ['RMC-6236'], inds: ['PDAC', 'NSCLC'], sponsor: 'revolution medicines' },
        { id: 'encorafenib', name: 'Encorafenib', brand: 'BRAFTOVI', company: 'Pfizer', moa: 'BRAF inhibitor', grp: 'RAS / BRAF', route: 'Oral', codes: ['LGX818'], inds: ['MEL', 'CRC', 'NSCLC'], sponsor: 'pfizer|array' },
        { id: 'ribociclib', name: 'Ribociclib', brand: 'KISQALI', company: 'Novartis', moa: 'CDK4/6 inhibitor', grp: 'CDK4/6', route: 'Oral', codes: ['LEE011'], inds: ['BC'], sponsor: 'novartis' },
        { id: 'abemaciclib', name: 'Abemaciclib', brand: 'VERZENIO', company: 'Lilly', moa: 'CDK4/6 inhibitor', grp: 'CDK4/6', route: 'Oral', codes: ['LY2835219'], inds: ['BC'], sponsor: 'lilly' },
        { id: 'elacestrant', name: 'Elacestrant', brand: 'ORSERDU', company: 'Stemline (Menarini)', moa: 'Oral SERD', grp: 'ER degraders', route: 'Oral', codes: ['RAD1901'], inds: ['BC'], sponsor: 'stemline|menarini|radius' },
        { id: 'camizestrant', name: 'Camizestrant', company: 'AstraZeneca', moa: 'Oral SERD', grp: 'ER degraders', route: 'Oral', codes: ['AZD9833'], inds: ['BC'], sponsor: 'astrazeneca' },
        { id: 'imlunestrant', name: 'Imlunestrant', brand: 'INLURIYO', company: 'Lilly', moa: 'Oral SERD', grp: 'ER degraders', route: 'Oral', codes: ['LY3484356'], inds: ['BC'], sponsor: 'lilly' },
        { id: 'enzalutamide', name: 'Enzalutamide', brand: 'XTANDI', company: 'Astellas / Pfizer', moa: 'Androgen receptor inhibitor', grp: 'AR / PSMA', route: 'Oral', codes: ['MDV3100'], inds: ['PC'], sponsor: 'astellas|pfizer|medivation' },
        { id: 'apalutamide', name: 'Apalutamide', brand: 'ERLEADA', company: 'Johnson & Johnson', moa: 'Androgen receptor inhibitor', grp: 'AR / PSMA', route: 'Oral', codes: ['ARN-509'], inds: ['PC'], sponsor: 'janssen|johnson|aragon' },
        { id: 'darolutamide', name: 'Darolutamide', brand: 'NUBEQA', company: 'Bayer', moa: 'Androgen receptor inhibitor', grp: 'AR / PSMA', route: 'Oral', codes: ['ODM-201'], inds: ['PC'], sponsor: 'bayer|orion' },
        { id: 'lutetiumlu177vipivotidetetraxetan', name: 'Lutetium Lu 177 vipivotide tetraxetan', short: '177Lu-PSMA-617', brand: 'PLUVICTO', generic: 'lutetium lu 177 vipivotide tetraxetan', company: 'Novartis', moa: 'PSMA-targeted radioligand therapy', grp: 'AR / PSMA', route: 'Intravenous', codes: ['177Lu-PSMA-617'], inds: ['PC'], epmc: '("vipivotide tetraxetan" OR "177Lu-PSMA-617" OR "Lu-PSMA-617")', intr: '"vipivotide tetraxetan" OR "177Lu-PSMA-617"', sponsor: 'novartis|advanced accelerator|endocyte' },
        { id: 'olaparib', name: 'Olaparib', brand: 'LYNPARZA', company: 'AstraZeneca / Merck & Co. (MSD)', moa: 'PARP inhibitor', grp: 'PARP', route: 'Oral', codes: ['AZD2281'], inds: ['BC', 'OC', 'PC', 'PDAC'], sponsor: 'astrazeneca|merck sharp|msd' },
        { id: 'niraparib', name: 'Niraparib', brand: 'ZEJULA', company: 'GSK', moa: 'PARP inhibitor', grp: 'PARP', route: 'Oral', codes: ['MK-4827'], inds: ['OC'], sponsor: 'glaxo|gsk|tesaro' },
        { id: 'sacituzumabgovitecan', name: 'Sacituzumab govitecan', short: 'Sacituzumab govitecan', brand: 'TRODELVY', generic: 'sacituzumab govitecan', company: 'Gilead', moa: 'TROP2-directed ADC (SN-38 payload)', grp: 'ADC: TROP2 / Nectin-4', route: 'Intravenous', codes: ['IMMU-132'], inds: ['BC', 'NSCLC'], epmc: '("sacituzumab govitecan" OR IMMU-132)', intr: '"sacituzumab govitecan" OR IMMU-132', sponsor: 'gilead|immunomedics' },
        { id: 'datopotamabderuxtecan', name: 'Datopotamab deruxtecan', short: 'Dato-DXd', brand: 'DATROWAY', generic: 'datopotamab deruxtecan', company: 'Daiichi Sankyo / AstraZeneca', moa: 'TROP2-directed ADC (topoisomerase I payload)', grp: 'ADC: TROP2 / Nectin-4', route: 'Intravenous', codes: ['DS-1062', 'Dato-DXd'], inds: ['BC', 'NSCLC'], epmc: '("datopotamab deruxtecan" OR Dato-DXd OR DS-1062)', intr: '"datopotamab deruxtecan" OR DS-1062', sponsor: 'daiichi|astrazeneca' },
        { id: 'enfortumabvedotin', name: 'Enfortumab vedotin', short: 'Enfortumab vedotin', brand: 'PADCEV', generic: 'enfortumab vedotin', company: 'Astellas / Pfizer', moa: 'Nectin-4-directed ADC (MMAE payload)', grp: 'ADC: TROP2 / Nectin-4', route: 'Intravenous', codes: ['ASG-22ME'], inds: ['URO'], epmc: '("enfortumab vedotin" OR ASG-22ME)', intr: '"enfortumab vedotin" OR ASG-22ME', sponsor: 'astellas|seagen|pfizer' },
        { id: 'cabozantinib', name: 'Cabozantinib', brand: 'CABOMETYX', company: 'Exelixis / Ipsen', moa: 'VEGFR / MET / AXL multikinase inhibitor', grp: 'VEGF / HIF-2α', route: 'Oral', codes: ['XL184'], inds: ['RCC', 'HCC'], sponsor: 'exelixis|ipsen' },
        { id: 'lenvatinib', name: 'Lenvatinib', brand: 'LENVIMA', company: 'Eisai / Merck & Co. (MSD)', moa: 'VEGFR / FGFR multikinase inhibitor', grp: 'VEGF / HIF-2α', route: 'Oral', codes: ['E7080'], inds: ['RCC', 'HCC'], sponsor: 'eisai|merck sharp|msd' },
        { id: 'belzutifan', name: 'Belzutifan', brand: 'WELIREG', company: 'Merck & Co. (MSD)', moa: 'HIF-2α inhibitor', grp: 'VEGF / HIF-2α', route: 'Oral', codes: ['MK-6482', 'PT2977'], inds: ['RCC'], sponsor: 'merck sharp|msd|merck|peloton' }
      ],
      guides: [
        ['NCCN', '("National Comprehensive Cancer Network" OR NCCN)', 'https://www.nccn.org/guidelines', ['US']],
        ['ASCO', '("American Society of Clinical Oncology" OR ASCO)', 'https://www.asco.org/', ['US']],
        ['Ontario Health (Cancer Care Ontario)', '("Cancer Care Ontario" OR "Ontario Health")', 'https://www.cancercareontario.ca/', ['CA']],
        ['NICE', '("National Institute for Health and Care Excellence" AND cancer)', 'https://www.nice.org.uk/', ['GB']],
        ['ESMO', '("European Society for Medical Oncology" OR ESMO)', 'https://www.esmo.org/guidelines', ['EU']],
        ['Leitlinienprogramm Onkologie (S3)', '("German Guideline Program in Oncology" OR "Leitlinienprogramm Onkologie" OR "S3 guideline")', 'https://www.leitlinienprogramm-onkologie.de/', ['DE']],
        ['AIOM', '(AIOM OR "Associazione Italiana di Oncologia Medica")', 'https://www.aiom.it/', ['IT']],
        ['SEOM', '(SEOM OR "Sociedad Española de Oncología Médica")', 'https://seom.org/', ['ES']],
        ['JSMO', '("Japanese Society of Medical Oncology" OR JSMO)', 'https://www.jsmo.or.jp/', ['JP']],
        ['eviQ', 'eviQ', 'https://www.eviq.org.au/', ['AU']]
      ],
      congresses: [
        ['ASCO', 'ASCO Annual Meeting', 'https://www.asco.org/'],
        ['ESMO', 'ESMO Congress', 'https://www.esmo.org/'],
        ['AACR', 'AACR Annual Meeting', 'https://www.aacr.org/'],
        ['SABCS', 'San Antonio Breast Cancer Symposium', 'https://www.sabcs.org/'],
        ['ASCO GU', 'ASCO Genitourinary Cancers Symposium', 'https://www.asco.org/'],
        ['ASCO GI', 'ASCO Gastrointestinal Cancers Symposium', 'https://www.asco.org/'],
        ['WCLC', 'IASLC World Conference on Lung Cancer', 'https://www.iaslc.org/'],
        ['SITC', 'Society for Immunotherapy of Cancer Annual Meeting', 'https://www.sitcancer.org/'],
        ['SGO', "SGO Annual Meeting on Women's Cancer", 'https://www.sgo.org/'],
        ['ESMO Breast', 'ESMO Breast Cancer Annual Congress', 'https://www.esmo.org/'],
        ['JSMO', 'JSMO Annual Meeting', 'https://www.jsmo.or.jp/']
      ],
      advocacy: [
        ['American Cancer Society', 'Patient advocacy', ['*'], 'https://www.cancer.org'],
        ['LUNGevity Foundation', 'Patient advocacy', ['NSCLC'], 'https://www.lungevity.org'],
        ['Susan G. Komen', 'Patient advocacy', ['BC'], 'https://www.komen.org'],
        ['ZERO Prostate Cancer', 'Patient advocacy', ['PC'], 'https://zerocancer.org'],
        ['Colorectal Cancer Alliance', 'Patient advocacy', ['CRC'], 'https://colorectalcancer.org'],
        ['Melanoma Research Foundation', 'Patient advocacy', ['MEL'], 'https://melanoma.org'],
        ['Bladder Cancer Advocacy Network', 'Patient advocacy', ['URO'], 'https://bcan.org'],
        ['Pancreatic Cancer Action Network', 'Patient advocacy', ['PDAC'], 'https://pancan.org'],
        ['Ovarian Cancer Research Alliance', 'Patient advocacy', ['OC'], 'https://ocrahope.org'],
        ['NCI clinical trials search', 'Public trial finder', ['*'], 'https://www.cancer.gov/research/participate/clinical-trials-search']
      ],
      themes: [
        ['ADCs beyond HER2', '("antibody-drug conjugate" AND (TROP2 OR "Nectin-4" OR B7-H3 OR HER3 OR "folate receptor"))'],
        ['Bispecifics in solid tumors', '(("bispecific antibody" OR "bispecific antibodies") AND ("PD-1" OR VEGF OR EGFR OR "solid tumor" OR "solid tumors"))'],
        ['Perioperative immunotherapy', '((neoadjuvant OR perioperative) AND (immunotherapy OR "immune checkpoint"))'],
        ['ctDNA and molecular residual disease', '(ctDNA OR "circulating tumor DNA" OR "molecular residual disease" OR "minimal residual disease")'],
        ['RAS beyond G12C', '("pan-RAS" OR "RAS(ON)" OR "KRAS G12D" OR "pan-KRAS" OR "RAS inhibitor")'],
        ['Oral SERDs and ER degraders', '("oral SERD" OR "selective estrogen receptor degrader" OR ESR1 OR PROTAC)'],
        ['Radioligand therapy', '(radioligand OR radiopharmaceutical OR theranostic OR theranostics OR "177Lu")'],
        ['Immune-related adverse events', '("immune-related adverse event" OR "immune-related adverse events" OR irAE OR irAEs)'],
        ['Tumor-agnostic biomarkers', '("tumor-agnostic" OR "tissue-agnostic" OR "MSI-H" OR dMMR OR NTRK)'],
        ['Subcutaneous checkpoint inhibitors', '(subcutaneous AND (pembrolizumab OR nivolumab OR atezolizumab OR amivantamab))']
      ],
      pros: ['EORTC QLQ-C30', 'FACT-G', 'PRO-CTCAE', 'EQ-5D', 'FACT-B', 'FACT-P', 'EORTC QLQ-LC13', 'FACT-L', 'BPI-SF', 'MDASI'],
      endpoints: [
        [/pathologic(al)? complete response|\bpCR\b/i, 'pCR'],
        [/event[- ]free survival|\bEFS\b/i, 'EFS'],
        [/disease[- ]free survival|\bi?DFS\b/i, 'DFS / iDFS'],
        [/metastasis[- ]free survival|\bMFS\b/i, 'MFS'],
        [/radiographic progression|\brPFS\b/i, 'rPFS'],
        [/progression[- ]free|\bPFS\b/i, 'PFS'],
        [/overall survival|\bOS\b/i, 'Overall survival'],
        [/objective response|overall response rate|\bORR\b/i, 'ORR'],
        [/duration of response|\bDoR\b/i, 'Duration of response'],
        [/\bPSA\b/i, 'PSA response'],
        [/dose[- ]limiting|\bDLT\b|maximum tolerated/i, 'DLT / MTD']
      ],
      elig: [
        [/ECOG/i, 'ECOG performance status'],
        [/brain metast|CNS metast/i, 'Brain metastases rules'],
        [/measurable disease|RECIST/i, 'Measurable disease (RECIST)'],
        [/prior (systemic|line|therapy|treatment)|treatment[- ]na[iï]ve|previously untreated/i, 'Prior therapy / line'],
        [/\bEGFR\b|\bALK\b|\bKRAS\b|\bBRAF\b|\bHER2\b|PD-L1|\bBRCA|\bMSI/i, 'Biomarker selection'],
        [/autoimmune/i, 'Autoimmune disease exclusion'],
        [/interstitial lung|pneumonitis/i, 'ILD / pneumonitis history']
      ],
      gaps: [
        ['brain', 'Brain metastases', '("brain metastases" OR "CNS metastases" OR intracranial)'],
        ['postio', 'Post-immunotherapy settings', '("after immunotherapy" OR "post-immunotherapy" OR "immunotherapy-refractory" OR "PD-1 refractory" OR "checkpoint inhibitor resistance")'],
        ['seq', 'Treatment sequencing', '(sequencing OR "treatment sequence" OR "subsequent therapy" OR "later-line")']
      ],
      pops: [['ps2', 'Poor performance status (ECOG 2+)', '("ECOG 2" OR "ECOG PS 2" OR "poor performance status" OR "performance status 2")', '"poor performance status"[tiab] OR "ECOG 2"[tiab]']]
    },
    {
      id: 'HEMONC', name: 'Hematologic malignancies', short: 'Heme malig',
      desc: 'Myeloma, lymphomas and leukemias, including cellular and T-cell redirecting therapies',
      fedTerms: ['leukemia', 'lymphoma'],
      specialties: 'hematolog|oncolog|transplant',
      inds: [
        { id: 'MM', name: 'Multiple myeloma', short: 'multiple myeloma', abbr: ['mm', 'rrmm', 'ndmm'], syn: ['myeloma', 'plasma cell myeloma'], epmc: '("multiple myeloma")', ct: 'multiple myeloma', re: /multiple myeloma|plasma cell myeloma/i, label: /multiple myeloma/i, core: true },
        { id: 'DLBCL', name: 'Diffuse large B-cell lymphoma', short: 'diffuse large B-cell lymphoma', abbr: ['dlbcl', 'lbcl'], syn: ['large b-cell lymphoma', 'aggressive b-cell lymphoma'], epmc: '("diffuse large B-cell lymphoma" OR "large B-cell lymphoma" OR DLBCL)', ct: 'diffuse large b-cell lymphoma', re: /large b[- ]cell lymphoma|\bDLBCL\b|\bLBCL\b/i, label: /large b-cell lymphoma/i, core: true },
        { id: 'CLL', name: 'Chronic lymphocytic leukemia', short: 'chronic lymphocytic leukemia', abbr: ['cll', 'sll'], syn: ['small lymphocytic lymphoma', 'chronic lymphocytic leukaemia'], epmc: '("chronic lymphocytic leukemia" OR "chronic lymphocytic leukaemia" OR CLL)', ct: 'chronic lymphocytic leukemia', re: /chronic lymphocytic leuk|small lymphocytic lymphoma|\bCLL\b/i, label: /chronic lymphocytic leukemia/i, core: true },
        { id: 'FL', name: 'Follicular lymphoma', short: 'follicular lymphoma', abbr: ['fl'], syn: [], epmc: '("follicular lymphoma")', ct: 'follicular lymphoma', re: /follicular lymphoma/i, label: /follicular lymphoma/i },
        { id: 'MCL', name: 'Mantle cell lymphoma', short: 'mantle cell lymphoma', abbr: ['mcl'], syn: [], epmc: '("mantle cell lymphoma")', ct: 'mantle cell lymphoma', re: /mantle[- ]cell/i, label: /mantle cell lymphoma/i },
        { id: 'AML', name: 'Acute myeloid leukemia', short: 'acute myeloid leukemia', abbr: ['aml'], syn: ['acute myelogenous leukemia', 'acute myeloid leukaemia'], epmc: '("acute myeloid leukemia" OR "acute myeloid leukaemia" OR AML)', ct: 'acute myeloid leukemia', re: /acute myel(oid|ogenous) leuk|\bAML\b/i, label: /acute myeloid leukemia/i },
        { id: 'MDS', name: 'Myelodysplastic syndromes', short: 'myelodysplastic syndromes', abbr: ['mds', 'lr-mds', 'hr-mds'], syn: ['myelodysplastic neoplasms'], epmc: '("myelodysplastic syndrome" OR "myelodysplastic syndromes" OR "myelodysplastic neoplasms")', ct: 'myelodysplastic syndromes', re: /myelodysplas|\bMDS\b/i, label: /myelodysplastic/i },
        { id: 'CML', name: 'Chronic myeloid leukemia', short: 'chronic myeloid leukemia', abbr: ['cml'], syn: ['chronic myelogenous leukemia', 'chronic myeloid leukaemia'], epmc: '("chronic myeloid leukemia" OR "chronic myeloid leukaemia" OR "chronic myelogenous leukemia")', ct: 'chronic myeloid leukemia', re: /chronic myel(oid|ogenous) leuk|\bCML\b/i, label: /chronic myeloid leukemia|chronic myelogenous leukemia/i },
        { id: 'ALL', name: 'Acute lymphoblastic leukemia', short: 'acute lymphoblastic leukemia', abbr: ['b-all', 't-all'], syn: ['acute lymphocytic leukemia', 'acute lymphoblastic leukaemia'], epmc: '("acute lymphoblastic leukemia" OR "acute lymphoblastic leukaemia")', ct: 'acute lymphoblastic leukemia', re: /acute lymphoblastic leuk|acute lymphocytic leuk|\bB-ALL\b|\bT-ALL\b/i, label: /acute lymphoblastic leukemia/i }
      ],
      assets: [
        { id: 'daratumumab', name: 'Daratumumab', brand: 'DARZALEX', company: 'Johnson & Johnson / Genmab', moa: 'Anti-CD38 mAb', grp: 'CD38', route: 'Injectable', inds: ['MM'], sponsor: 'janssen|johnson|genmab' },
        { id: 'isatuximab', name: 'Isatuximab', brand: 'SARCLISA', company: 'Sanofi', moa: 'Anti-CD38 mAb', grp: 'CD38', route: 'Intravenous', codes: ['SAR650984'], inds: ['MM'], sponsor: 'sanofi' },
        { id: 'teclistamab', name: 'Teclistamab', brand: 'TECVAYLI', company: 'Johnson & Johnson', moa: 'BCMA x CD3 bispecific', grp: 'BCMA', route: 'Injectable', codes: ['JNJ-64007957'], inds: ['MM'], sponsor: 'janssen|johnson' },
        { id: 'elranatamab', name: 'Elranatamab', brand: 'ELREXFIO', company: 'Pfizer', moa: 'BCMA x CD3 bispecific', grp: 'BCMA', route: 'Injectable', codes: ['PF-06863135'], inds: ['MM'], sponsor: 'pfizer' },
        { id: 'linvoseltamab', name: 'Linvoseltamab', brand: 'LYNOZYFIC', company: 'Regeneron', moa: 'BCMA x CD3 bispecific', grp: 'BCMA', route: 'Intravenous', codes: ['REGN5458'], inds: ['MM'], sponsor: 'regeneron' },
        { id: 'ciltacabtageneautoleucel', name: 'Ciltacabtagene autoleucel', short: 'Cilta-cel', brand: 'CARVYKTI', company: 'Johnson & Johnson / Legend Biotech', moa: 'BCMA-directed CAR-T', grp: 'BCMA', route: 'Intravenous', codes: ['JNJ-68284528', 'LCAR-B38M'], inds: ['MM'], epmc: '("ciltacabtagene autoleucel" OR cilta-cel OR JNJ-68284528 OR LCAR-B38M)', intr: '"ciltacabtagene autoleucel" OR JNJ-68284528 OR LCAR-B38M', sponsor: 'janssen|johnson|legend' },
        { id: 'idecabtagenevicleucel', name: 'Idecabtagene vicleucel', short: 'Ide-cel', brand: 'ABECMA', company: 'BMS', moa: 'BCMA-directed CAR-T', grp: 'BCMA', route: 'Intravenous', codes: ['bb2121'], inds: ['MM'], epmc: '("idecabtagene vicleucel" OR ide-cel OR bb2121)', intr: '"idecabtagene vicleucel" OR bb2121', sponsor: 'bristol|celgene|bluebird|2seventy' },
        { id: 'belantamabmafodotin', name: 'Belantamab mafodotin', short: 'Belantamab', brand: 'BLENREP', generic: 'belantamab mafodotin', company: 'GSK', moa: 'BCMA-directed ADC (MMAF payload)', grp: 'BCMA', route: 'Intravenous', codes: ['GSK2857916'], inds: ['MM'], epmc: '("belantamab mafodotin" OR GSK2857916)', intr: '"belantamab mafodotin" OR GSK2857916', sponsor: 'glaxo|gsk' },
        { id: 'talquetamab', name: 'Talquetamab', brand: 'TALVEY', company: 'Johnson & Johnson', moa: 'GPRC5D x CD3 bispecific', grp: 'GPRC5D', route: 'Injectable', codes: ['JNJ-64407564'], inds: ['MM'], sponsor: 'janssen|johnson' },
        { id: 'lenalidomide', name: 'Lenalidomide', brand: 'REVLIMID', company: 'BMS', moa: 'Immunomodulatory drug (cereblon modulator)', grp: 'IMiD / CELMoD', route: 'Oral', inds: ['MM', 'FL', 'MCL', 'MDS'], sponsor: 'bristol|celgene' },
        { id: 'iberdomide', name: 'Iberdomide', company: 'BMS', moa: 'CELMoD (cereblon E3 ligase modulator)', grp: 'IMiD / CELMoD', route: 'Oral', codes: ['CC-220'], inds: ['MM'], sponsor: 'bristol|celgene' },
        { id: 'mezigdomide', name: 'Mezigdomide', company: 'BMS', moa: 'CELMoD (cereblon E3 ligase modulator)', grp: 'IMiD / CELMoD', route: 'Oral', codes: ['CC-92480'], inds: ['MM'], sponsor: 'bristol|celgene' },
        { id: 'epcoritamab', name: 'Epcoritamab', brand: 'EPKINLY', company: 'AbbVie / Genmab', moa: 'CD20 x CD3 bispecific', grp: 'CD20 x CD3', route: 'Injectable', codes: ['GEN3013'], inds: ['DLBCL', 'FL'], sponsor: 'genmab|abbvie' },
        { id: 'glofitamab', name: 'Glofitamab', brand: 'COLUMVI', company: 'Roche / Genentech', moa: 'CD20 x CD3 bispecific', grp: 'CD20 x CD3', route: 'Intravenous', codes: ['RG6026'], inds: ['DLBCL', 'MCL'], sponsor: 'hoffmann|roche|genentech' },
        { id: 'mosunetuzumab', name: 'Mosunetuzumab', brand: 'LUNSUMIO', company: 'Roche / Genentech', moa: 'CD20 x CD3 bispecific', grp: 'CD20 x CD3', route: 'Intravenous', codes: ['RG7828'], inds: ['FL', 'DLBCL'], sponsor: 'hoffmann|roche|genentech' },
        { id: 'axicabtageneciloleucel', name: 'Axicabtagene ciloleucel', short: 'Axi-cel', brand: 'YESCARTA', company: 'Gilead (Kite)', moa: 'CD19-directed CAR-T', grp: 'CD19 / CD79b', route: 'Intravenous', codes: ['KTE-C19'], inds: ['DLBCL', 'FL'], epmc: '("axicabtagene ciloleucel" OR axi-cel OR KTE-C19)', intr: '"axicabtagene ciloleucel" OR KTE-C19', sponsor: 'kite|gilead' },
        { id: 'lisocabtagenemaraleucel', name: 'Lisocabtagene maraleucel', short: 'Liso-cel', brand: 'BREYANZI', company: 'BMS', moa: 'CD19-directed CAR-T', grp: 'CD19 / CD79b', route: 'Intravenous', codes: ['JCAR017'], inds: ['DLBCL', 'FL', 'CLL', 'MCL'], epmc: '("lisocabtagene maraleucel" OR liso-cel OR JCAR017)', intr: '"lisocabtagene maraleucel" OR JCAR017', sponsor: 'bristol|celgene|juno' },
        { id: 'polatuzumabvedotin', name: 'Polatuzumab vedotin', short: 'Polatuzumab', brand: 'POLIVY', generic: 'polatuzumab vedotin', company: 'Roche / Genentech', moa: 'CD79b-directed ADC (MMAE payload)', grp: 'CD19 / CD79b', route: 'Intravenous', codes: ['RG7596', 'DCDS4501A'], inds: ['DLBCL'], epmc: '("polatuzumab vedotin" OR polatuzumab OR RG7596)', intr: '"polatuzumab vedotin" OR RG7596', sponsor: 'hoffmann|roche|genentech' },
        { id: 'blinatumomab', name: 'Blinatumomab', brand: 'BLINCYTO', company: 'Amgen', moa: 'CD19 x CD3 bispecific (BiTE)', grp: 'CD19 / CD79b', route: 'Intravenous', codes: ['AMG 103', 'MT103'], inds: ['ALL'], sponsor: 'amgen' },
        { id: 'ibrutinib', name: 'Ibrutinib', brand: 'IMBRUVICA', company: 'AbbVie / Johnson & Johnson', moa: 'Covalent BTK inhibitor', grp: 'BTK', route: 'Oral', codes: ['PCI-32765'], inds: ['CLL', 'MCL'], sponsor: 'pharmacyclics|abbvie|janssen|johnson' },
        { id: 'acalabrutinib', name: 'Acalabrutinib', brand: 'CALQUENCE', company: 'AstraZeneca', moa: 'Covalent BTK inhibitor', grp: 'BTK', route: 'Oral', codes: ['ACP-196'], inds: ['CLL', 'MCL'], sponsor: 'astrazeneca|acerta' },
        { id: 'zanubrutinib', name: 'Zanubrutinib', brand: 'BRUKINSA', company: 'BeOne Medicines', moa: 'Covalent BTK inhibitor', grp: 'BTK', route: 'Oral', codes: ['BGB-3111'], inds: ['CLL', 'MCL', 'FL'], sponsor: 'beigene|beone' },
        { id: 'pirtobrutinib', name: 'Pirtobrutinib', brand: 'JAYPIRCA', company: 'Lilly', moa: 'Non-covalent BTK inhibitor', grp: 'BTK', route: 'Oral', codes: ['LOXO-305'], inds: ['CLL', 'MCL'], sponsor: 'lilly|loxo' },
        { id: 'venetoclax', name: 'Venetoclax', brand: 'VENCLEXTA', company: 'AbbVie / Genentech', moa: 'BCL-2 inhibitor', grp: 'BCL-2', route: 'Oral', codes: ['ABT-199'], inds: ['CLL', 'AML', 'MCL'], sponsor: 'abbvie|genentech|hoffmann|roche' },
        { id: 'sonrotoclax', name: 'Sonrotoclax', company: 'BeOne Medicines', moa: 'BCL-2 inhibitor', grp: 'BCL-2', route: 'Oral', codes: ['BGB-11417'], inds: ['CLL'], sponsor: 'beigene|beone' },
        { id: 'gilteritinib', name: 'Gilteritinib', brand: 'XOSPATA', company: 'Astellas', moa: 'FLT3 inhibitor', grp: 'FLT3 / menin', route: 'Oral', codes: ['ASP2215'], inds: ['AML'], sponsor: 'astellas' },
        { id: 'quizartinib', name: 'Quizartinib', brand: 'VANFLYTA', company: 'Daiichi Sankyo', moa: 'FLT3 inhibitor', grp: 'FLT3 / menin', route: 'Oral', codes: ['AC220'], inds: ['AML'], sponsor: 'daiichi' },
        { id: 'revumenib', name: 'Revumenib', brand: 'REVUFORJ', company: 'Syndax', moa: 'Menin inhibitor', grp: 'FLT3 / menin', route: 'Oral', codes: ['SNDX-5613'], inds: ['AML', 'ALL'], sponsor: 'syndax' },
        { id: 'asciminib', name: 'Asciminib', brand: 'SCEMBLIX', company: 'Novartis', moa: 'BCR-ABL1 STAMP (allosteric) inhibitor', grp: 'BCR-ABL', route: 'Oral', codes: ['ABL001'], inds: ['CML'], sponsor: 'novartis' },
        { id: 'luspatercept', name: 'Luspatercept', brand: 'REBLOZYL', company: 'BMS', moa: 'Erythroid maturation agent (activin receptor ligand trap)', grp: 'Erythroid maturation', route: 'Injectable', codes: ['ACE-536'], inds: ['MDS'], sponsor: 'bristol|celgene|acceleron' }
      ],
      guides: [
        ['NCCN', '("National Comprehensive Cancer Network" OR NCCN)', 'https://www.nccn.org/guidelines', ['US']],
        ['American Society of Hematology', '("American Society of Hematology" OR ASH)', 'https://www.hematology.org/', ['US']],
        ['ESMO', '("European Society for Medical Oncology" OR ESMO)', 'https://www.esmo.org/guidelines', ['EU']],
        ['European LeukemiaNet', '("European LeukemiaNet" OR ELN)', 'https://www.leukemia-net.org/', ['EU']],
        ['European Hematology Association', '("European Hematology Association" OR EHA)', 'https://ehaweb.org/', ['EU']],
        ['International Myeloma Working Group', '("International Myeloma Working Group" OR IMWG)', 'https://www.myeloma.org/', ['*']],
        ['British Society for Haematology', '("British Society for Haematology" OR BSH)', 'https://b-s-h.org.uk/', ['GB']],
        ['Onkopedia (DGHO)', '(Onkopedia OR DGHO)', 'https://www.onkopedia.com/', ['DE']]
      ],
      congresses: [
        ['ASH', 'ASH Annual Meeting and Exposition', 'https://www.hematology.org/meetings/annual-meeting'],
        ['EHA', 'EHA Congress', 'https://ehaweb.org/'],
        ['ASCO', 'ASCO Annual Meeting', 'https://www.asco.org/'],
        ['IMS', 'International Myeloma Society Annual Meeting', 'https://www.myelomasociety.org/'],
        ['ICML', 'International Conference on Malignant Lymphoma (Lugano)', 'https://www.lymphcon.ch/'],
        ['Tandem Meetings', 'Tandem Meetings of ASTCT and CIBMTR', 'https://www.astct.org/'],
        ['EBMT', 'EBMT Annual Meeting', 'https://www.ebmt.org/'],
        ['SOHO', 'Society of Hematologic Oncology Annual Meeting', 'https://www.soho.world/'],
        ['BSH', 'BSH Annual Scientific Meeting', 'https://b-s-h.org.uk/']
      ],
      advocacy: [
        ['Leukemia & Lymphoma Society', 'Patient advocacy', ['*'], 'https://www.lls.org'],
        ['International Myeloma Foundation', 'Patient advocacy', ['MM'], 'https://www.myeloma.org'],
        ['Multiple Myeloma Research Foundation', 'Patient advocacy', ['MM'], 'https://themmrf.org'],
        ['Lymphoma Research Foundation', 'Patient advocacy', ['DLBCL', 'FL', 'MCL'], 'https://lymphoma.org'],
        ['CLL Society', 'Patient advocacy', ['CLL'], 'https://cllsociety.org'],
        ['MDS Foundation', 'Patient advocacy', ['MDS'], 'https://www.mds-foundation.org'],
        ['American Society of Hematology', 'Professional society', ['*'], 'https://www.hematology.org'],
        ['NCI clinical trials search', 'Public trial finder', ['*'], 'https://www.cancer.gov/research/participate/clinical-trials-search']
      ],
      themes: [
        ['T-cell engagers and infection risk', '(("bispecific antibody" OR "bispecific antibodies" OR "T-cell engager" OR "T-cell engagers") AND (infection OR infections OR hypogammaglobulinemia))'],
        ['CAR-T in earlier lines', '(("CAR T" OR "CAR-T" OR "chimeric antigen receptor") AND ("second-line" OR "earlier lines" OR "first relapse" OR "early relapse"))'],
        ['CRS and ICANS management', '("cytokine release syndrome" OR ICANS OR "immune effector cell-associated neurotoxicity")'],
        ['MRD-guided therapy', '("minimal residual disease" OR "measurable residual disease" OR MRD)'],
        ['Fixed-duration regimens', '("fixed-duration" OR "fixed duration" OR "time-limited therapy")'],
        ['Menin inhibitors', '(menin AND (KMT2A OR NPM1 OR inhibitor OR inhibitors))'],
        ['Non-covalent BTK inhibitors and BTK degraders', '("non-covalent BTK" OR "noncovalent BTK" OR "BTK degrader" OR "BTK degraders")'],
        ['Quadruplet induction in myeloma', '(quadruplet OR "D-VRd" OR "Isa-VRd" OR "Dara-VRd")'],
        ['Outpatient and community delivery of T-cell redirection', '((outpatient OR "community setting" OR "community practice") AND ("CAR T" OR "CAR-T" OR bispecific))'],
        ['High-risk genetics', '("high-risk cytogenetics" OR "del(17p)" OR TP53 OR "t(4;14)" OR "1q gain")']
      ],
      pros: ['EORTC QLQ-C30', 'EORTC QLQ-MY20', 'EORTC QLQ-CLL17', 'FACT-Lym', 'FACT-Leu', 'FACT-G', 'FACIT-Fatigue', 'EQ-5D', 'PRO-CTCAE', 'MDASI'],
      endpoints: [
        [/minimal residual|measurable residual|\bMRD\b/i, 'MRD negativity'],
        [/major molecular response|\bMMR\b/i, 'Major molecular response'],
        [/transfusion independence|\bRBC-?TI\b/i, 'Transfusion independence'],
        [/complete (remission|response)|\bCRh?\b/i, 'Complete response / remission'],
        [/event[- ]free survival|\bEFS\b/i, 'EFS'],
        [/progression[- ]free|\bPFS\b/i, 'PFS'],
        [/overall survival|\bOS\b/i, 'Overall survival'],
        [/(overall|objective) response|\bORR\b/i, 'ORR'],
        [/duration of response|\bDoR\b/i, 'Duration of response'],
        [/dose[- ]limiting|\bDLT\b|maximum tolerated/i, 'DLT / MTD']
      ],
      elig: [
        [/ECOG/i, 'ECOG performance status'],
        [/refractory|relapsed|prior lines?|lines? of (prior )?therapy/i, 'Prior lines / refractoriness'],
        [/transplant[- ](in)?eligible|stem cell transplant|\bASCT\b|\bHSCT\b/i, 'Transplant eligibility / history'],
        [/CNS (involvement|lymphoma|disease)/i, 'CNS involvement rules'],
        [/del\(17p\)|\bTP53\b|cytogenetic|\bFLT3\b|\bIDH[12]?\b|\bNPM1\b|\bKMT2A\b/i, 'Molecular / cytogenetic selection'],
        [/prior (anti-)?(BCMA|CAR[- ]?T|bispecific|BTK)/i, 'Prior class exposure'],
        [/measurable disease|M[- ]protein/i, 'Measurable disease']
      ],
      gaps: [
        ['postredirect', 'Sequencing after T-cell redirection', '("after CAR T" OR "post-CAR T" OR "prior BCMA" OR "after bispecific" OR "BCMA-exposed")'],
        ['hrgen', 'High-risk genetics', '("high-risk cytogenetics" OR "del(17p)" OR TP53 OR "complex karyotype")'],
        ['infx', 'Infection prophylaxis', '(infection AND (prophylaxis OR IVIG OR "immunoglobulin replacement"))']
      ],
      pops: [['unfit', 'Transplant-ineligible / unfit', '("transplant-ineligible" OR "transplant ineligible" OR "unfit for intensive" OR "unfit patients")', '"transplant-ineligible"[tiab] OR "unfit for intensive"[tiab]']]
    },
    {
      id: 'HEME', name: 'Hematology (non-malignant)', short: 'Hematology',
      desc: 'Bleeding disorders, hemoglobinopathies, complement-mediated and immune cytopenias, and iron deficiency',
      fedTerms: ['hemophilia', 'sickle cell'],
      specialties: 'hematolog|oncolog',
      inds: [
        { id: 'HEMA', name: 'Hemophilia A', short: 'hemophilia A', abbr: ['ha'], syn: ['haemophilia a', 'factor viii deficiency'], epmc: '("hemophilia A" OR "haemophilia A" OR "factor VIII deficiency")', ct: 'hemophilia A', re: /ha?emophilia a\b|factor viii deficiency/i, label: /hemophilia a\b|factor viii deficiency/i, core: true },
        { id: 'SCD', name: 'Sickle cell disease', short: 'sickle cell disease', abbr: ['scd'], syn: ['sickle cell anemia', 'sickle cell anaemia'], epmc: '("sickle cell disease" OR "sickle cell anemia" OR "sickle cell anaemia")', ct: 'sickle cell disease', re: /sickle[- ]?cell/i, label: /sickle cell disease/i, core: true },
        { id: 'PNH', name: 'Paroxysmal nocturnal hemoglobinuria', short: 'PNH', abbr: ['pnh'], syn: ['paroxysmal nocturnal haemoglobinuria'], epmc: '("paroxysmal nocturnal hemoglobinuria" OR "paroxysmal nocturnal haemoglobinuria" OR PNH)', ct: 'paroxysmal nocturnal hemoglobinuria', re: /paroxysmal nocturnal|\bPNH\b/i, label: /paroxysmal nocturnal hemoglobinuria/i, core: true },
        { id: 'HEMB', name: 'Hemophilia B', short: 'hemophilia B', abbr: ['hb'], syn: ['haemophilia b', 'factor ix deficiency', 'christmas disease'], epmc: '("hemophilia B" OR "haemophilia B" OR "factor IX deficiency")', ct: 'hemophilia B', re: /ha?emophilia b\b|factor ix deficiency/i, label: /hemophilia b\b|factor ix deficiency/i },
        { id: 'BTHAL', name: 'Beta-thalassemia', short: 'beta-thalassemia', abbr: ['tdt', 'ntdt'], syn: ['beta thalassemia', 'thalassaemia', 'β-thalassemia'], epmc: '("beta-thalassemia" OR "beta-thalassaemia" OR "β-thalassemia" OR thalassemia OR thalassaemia)', ct: 'beta-thalassemia', re: /thalass/i, not: /alpha[- ]?thalass|α[- ]?thalass/i, label: /thalass/i },
        { id: 'ITP', name: 'Immune thrombocytopenia', short: 'immune thrombocytopenia', abbr: ['itp'], syn: ['immune thrombocytopenic purpura', 'idiopathic thrombocytopenic purpura'], epmc: '("immune thrombocytopenia" OR "immune thrombocytopenic purpura" OR "idiopathic thrombocytopenic purpura")', ct: 'immune thrombocytopenia', re: /immune thrombocytop|idiopathic thrombocytop|\bITP\b/i, not: /thrombotic thrombocytopenic|heparin/i, label: /immune thrombocytopenia|idiopathic thrombocytopenic/i },
        { id: 'IDA', name: 'Iron deficiency anemia', short: 'iron deficiency anemia', abbr: ['ida'], syn: ['iron deficiency', 'iron deficiency anaemia'], epmc: '("iron deficiency anemia" OR "iron deficiency anaemia" OR "iron deficiency")', ct: 'iron deficiency anemia', re: /iron[- ]deficien/i, label: /iron deficiency/i }
      ],
      assets: [
        { id: 'emicizumab', name: 'Emicizumab', brand: 'HEMLIBRA', company: 'Roche / Chugai', moa: 'FIXa x FX bispecific (FVIII mimetic)', grp: 'FVIII replacement / mimetic', route: 'Injectable', codes: ['ACE910'], inds: ['HEMA'], sponsor: 'hoffmann|roche|genentech|chugai' },
        { id: 'denecimig', name: 'Denecimig (Mim8)', short: 'Mim8', company: 'Novo Nordisk', moa: 'FIXa x FX bispecific (FVIII mimetic)', grp: 'FVIII replacement / mimetic', route: 'Injectable', codes: ['Mim8'], inds: ['HEMA'], sponsor: 'novo nordisk' },
        { id: 'efanesoctocogalfa', name: 'Efanesoctocog alfa', short: 'Efanesoctocog', brand: 'ALTUVIIIO', company: 'Sanofi / Sobi', moa: 'High-sustained FVIII replacement (Fc-VWF-XTEN)', grp: 'FVIII replacement / mimetic', route: 'Intravenous', codes: ['BIVV001'], inds: ['HEMA'], epmc: '("efanesoctocog alfa" OR efanesoctocog OR BIVV001)', intr: 'efanesoctocog OR BIVV001', sponsor: 'sanofi|bioverativ|sobi|swedish orphan' },
        { id: 'concizumab', name: 'Concizumab', brand: 'ALHEMO', company: 'Novo Nordisk', moa: 'Anti-TFPI mAb', grp: 'Rebalancing agents', route: 'Injectable', inds: ['HEMA', 'HEMB'], sponsor: 'novo nordisk' },
        { id: 'marstacimab', name: 'Marstacimab', brand: 'HYMPAVZI', company: 'Pfizer', moa: 'Anti-TFPI mAb', grp: 'Rebalancing agents', route: 'Injectable', codes: ['PF-06741086'], inds: ['HEMA', 'HEMB'], sponsor: 'pfizer' },
        { id: 'fitusiran', name: 'Fitusiran', brand: 'QFITLIA', company: 'Sanofi', moa: 'Antithrombin-lowering siRNA', grp: 'Rebalancing agents', route: 'Injectable', codes: ['ALN-AT3', 'SAR439774'], inds: ['HEMA', 'HEMB'], sponsor: 'sanofi|genzyme|alnylam' },
        { id: 'etranacogenedezaparvovec', name: 'Etranacogene dezaparvovec', short: 'Etranacogene', brand: 'HEMGENIX', company: 'CSL Behring', moa: 'AAV5 FIX-Padua gene therapy', grp: 'Gene therapy / editing', route: 'Intravenous', codes: ['AMT-061'], inds: ['HEMB'], epmc: '("etranacogene dezaparvovec" OR AMT-061)', intr: '"etranacogene dezaparvovec" OR AMT-061', sponsor: 'csl|uniqure' },
        { id: 'exagamglogeneautotemcel', name: 'Exagamglogene autotemcel', short: 'Exa-cel', brand: 'CASGEVY', company: 'Vertex / CRISPR Therapeutics', moa: 'CRISPR-edited autologous HSC (BCL11A enhancer)', grp: 'Gene therapy / editing', route: 'Intravenous', codes: ['CTX001'], inds: ['SCD', 'BTHAL'], epmc: '("exagamglogene autotemcel" OR exa-cel OR CTX001)', intr: '"exagamglogene autotemcel" OR CTX001', sponsor: 'vertex|crispr' },
        { id: 'mitapivat', name: 'Mitapivat', brand: 'PYRUKYND', company: 'Agios', moa: 'Pyruvate kinase activator', grp: 'Erythroid / PK activation', route: 'Oral', codes: ['AG-348'], inds: ['BTHAL', 'SCD'], sponsor: 'agios' },
        { id: 'etavopivat', name: 'Etavopivat', company: 'Novo Nordisk', moa: 'Pyruvate kinase activator', grp: 'Erythroid / PK activation', route: 'Oral', codes: ['FT-4202'], inds: ['SCD'], sponsor: 'novo nordisk|forma' },
        { id: 'luspatercept', name: 'Luspatercept', brand: 'REBLOZYL', company: 'BMS', moa: 'Erythroid maturation agent (activin receptor ligand trap)', grp: 'Erythroid / PK activation', route: 'Injectable', codes: ['ACE-536'], inds: ['BTHAL'], sponsor: 'bristol|celgene|acceleron' },
        { id: 'crizanlizumab', name: 'Crizanlizumab', brand: 'ADAKVEO', company: 'Novartis', moa: 'Anti-P-selectin mAb', grp: 'P-selectin', route: 'Intravenous', codes: ['SEG101'], inds: ['SCD'], sponsor: 'novartis|selexys' },
        { id: 'ravulizumab', name: 'Ravulizumab', brand: 'ULTOMIRIS', company: 'AstraZeneca (Alexion)', moa: 'Long-acting C5 inhibitor', grp: 'Complement', route: 'Intravenous', codes: ['ALXN1210'], inds: ['PNH'], sponsor: 'alexion|astrazeneca' },
        { id: 'eculizumab', name: 'Eculizumab', brand: 'SOLIRIS', company: 'AstraZeneca (Alexion)', moa: 'C5 inhibitor', grp: 'Complement', route: 'Intravenous', inds: ['PNH'], sponsor: 'alexion|astrazeneca' },
        { id: 'crovalimab', name: 'Crovalimab', brand: 'PIASKY', company: 'Roche / Chugai', moa: 'Recycling C5 inhibitor mAb', grp: 'Complement', route: 'Injectable', codes: ['RG6107', 'SKY59'], inds: ['PNH'], sponsor: 'hoffmann|roche|chugai' },
        { id: 'iptacopan', name: 'Iptacopan', brand: 'FABHALTA', company: 'Novartis', moa: 'Factor B inhibitor', grp: 'Complement', route: 'Oral', codes: ['LNP023'], inds: ['PNH'], sponsor: 'novartis' },
        { id: 'danicopan', name: 'Danicopan', brand: 'VOYDEYA', company: 'AstraZeneca (Alexion)', moa: 'Factor D inhibitor', grp: 'Complement', route: 'Oral', codes: ['ALXN2040', 'ACH-4471'], inds: ['PNH'], sponsor: 'alexion|astrazeneca|achillion' },
        { id: 'pegcetacoplan', name: 'Pegcetacoplan', brand: 'EMPAVELI', company: 'Apellis / Sobi', moa: 'C3 inhibitor', grp: 'Complement', route: 'Injectable', codes: ['APL-2'], inds: ['PNH'], sponsor: 'apellis|sobi|swedish orphan', labelRoute: 'SUBCUTANEOUS' },
        { id: 'romiplostim', name: 'Romiplostim', brand: 'NPLATE', company: 'Amgen', moa: 'Thrombopoietin receptor agonist', grp: 'TPO-RA', route: 'Injectable', codes: ['AMG 531'], inds: ['ITP'], sponsor: 'amgen' },
        { id: 'eltrombopag', name: 'Eltrombopag', brand: 'PROMACTA', company: 'Novartis', moa: 'Thrombopoietin receptor agonist', grp: 'TPO-RA', route: 'Oral', inds: ['ITP'], sponsor: 'novartis|glaxo' },
        { id: 'avatrombopag', name: 'Avatrombopag', brand: 'DOPTELET', company: 'Sobi', moa: 'Thrombopoietin receptor agonist', grp: 'TPO-RA', route: 'Oral', inds: ['ITP'], sponsor: 'sobi|swedish orphan|dova|akarx' },
        { id: 'rilzabrutinib', name: 'Rilzabrutinib', brand: 'WAYRILZ', company: 'Sanofi', moa: 'BTK inhibitor', grp: 'BTK / SYK', route: 'Oral', codes: ['PRN1008'], inds: ['ITP'], sponsor: 'sanofi|principia' },
        { id: 'fostamatinib', name: 'Fostamatinib', brand: 'TAVALISSE', company: 'Rigel', moa: 'SYK inhibitor', grp: 'BTK / SYK', route: 'Oral', codes: ['R788'], inds: ['ITP'], sponsor: 'rigel' },
        { id: 'efgartigimod', name: 'Efgartigimod alfa', short: 'Efgartigimod', brand: 'VYVGART', generic: 'efgartigimod', company: 'argenx', moa: 'FcRn antagonist', grp: 'FcRn', route: 'Intravenous', codes: ['ARGX-113'], inds: ['ITP'], sponsor: 'argenx' },
        { id: 'ferriccarboxymaltose', name: 'Ferric carboxymaltose', brand: 'INJECTAFER', generic: 'ferric carboxymaltose', company: 'American Regent (Daiichi Sankyo)', moa: 'Intravenous iron', grp: 'IV iron', route: 'Intravenous', inds: ['IDA'], epmc: '("ferric carboxymaltose")', intr: '"ferric carboxymaltose"', sponsor: 'american regent|luitpold|vifor|daiichi' },
        { id: 'ferricderisomaltose', name: 'Ferric derisomaltose', brand: 'MONOFERRIC', generic: 'ferric derisomaltose', company: 'Pharmacosmos', moa: 'Intravenous iron', grp: 'IV iron', route: 'Intravenous', inds: ['IDA'], epmc: '("ferric derisomaltose" OR "iron isomaltoside")', intr: '"ferric derisomaltose" OR "iron isomaltoside"', sponsor: 'pharmacosmos' }
      ],
      guides: [
        ['American Society of Hematology', '("American Society of Hematology" OR ASH)', 'https://www.hematology.org/', ['US']],
        ['NBDF MASAC', '(MASAC OR "Medical and Scientific Advisory Council")', 'https://www.bleeding.org/', ['US']],
        ['NHLBI', '("National Heart, Lung, and Blood Institute" AND "sickle cell")', 'https://www.nhlbi.nih.gov/', ['US']],
        ['World Federation of Hemophilia', '("World Federation of Hemophilia" OR "WFH guidelines")', 'https://wfh.org/', ['*']],
        ['ISTH', '("International Society on Thrombosis and Haemostasis" OR ISTH)', 'https://www.isth.org/', ['*']],
        ['Thalassaemia International Federation', '"Thalassaemia International Federation"', 'https://thalassaemia.org.cy/', ['*']],
        ['British Society for Haematology', '("British Society for Haematology" OR BSH)', 'https://b-s-h.org.uk/', ['GB']],
        ['UKHCDO', '(UKHCDO OR "United Kingdom Haemophilia Centre Doctors")', 'https://www.ukhcdo.org/', ['GB']],
        ['European Hematology Association', '("European Hematology Association" OR EHA)', 'https://ehaweb.org/', ['EU']]
      ],
      congresses: [
        ['ASH', 'ASH Annual Meeting and Exposition', 'https://www.hematology.org/meetings/annual-meeting'],
        ['EHA', 'EHA Congress', 'https://ehaweb.org/'],
        ['ISTH', 'ISTH Congress', 'https://www.isth.org/'],
        ['WFH', 'WFH World Congress', 'https://wfh.org/'],
        ['EAHAD', 'EAHAD Annual Congress', 'https://eahad.org/'],
        ['ASPHO', 'ASPHO Annual Conference', 'https://aspho.org/'],
        ['SCDAA', 'SCDAA Annual National Convention', 'https://www.sicklecelldisease.org/'],
        ['BSH', 'BSH Annual Scientific Meeting', 'https://b-s-h.org.uk/']
      ],
      advocacy: [
        ['National Bleeding Disorders Foundation', 'Patient advocacy', ['HEMA', 'HEMB'], 'https://www.bleeding.org'],
        ['Hemophilia Federation of America', 'Patient advocacy', ['HEMA', 'HEMB'], 'https://www.hemophiliafed.org'],
        ['World Federation of Hemophilia', 'Patient advocacy', ['HEMA', 'HEMB'], 'https://wfh.org'],
        ['Sickle Cell Disease Association of America', 'Patient advocacy', ['SCD'], 'https://www.sicklecelldisease.org'],
        ["Cooley's Anemia Foundation", 'Patient advocacy', ['BTHAL'], 'https://www.thalassemia.org'],
        ['Aplastic Anemia and MDS International Foundation', 'Patient advocacy', ['PNH'], 'https://www.aamds.org'],
        ['Platelet Disorder Support Association', 'Patient advocacy', ['ITP'], 'https://www.pdsa.org'],
        ['American Society of Hematology', 'Professional society', ['*'], 'https://www.hematology.org']
      ],
      themes: [
        ['Non-factor prophylaxis', '("non-factor" OR emicizumab OR "anti-TFPI" OR fitusiran OR rebalancing)'],
        ['Gene therapy durability', '("gene therapy" AND (durability OR "factor expression" OR "long-term follow-up"))'],
        ['Curative therapies for hemoglobinopathies', '(("gene editing" OR CRISPR OR "base editing" OR "gene therapy") AND (sickle OR thalassemia OR thalassaemia))'],
        ['Pyruvate kinase activators', '("pyruvate kinase activator" OR "pyruvate kinase activators" OR mitapivat OR etavopivat)'],
        ['Proximal complement inhibition', '(("factor B" OR "factor D" OR C3 OR "proximal complement") AND ("paroxysmal nocturnal" OR PNH))'],
        ['Extravascular hemolysis', '("extravascular hemolysis" OR "extravascular haemolysis")'],
        ['Vaso-occlusive crisis prevention', '("vaso-occlusive" OR vasoocclusive OR "pain crisis" OR "pain crises")'],
        ['Joint health and bleed outcomes', '("annualized bleeding rate" OR "joint health" OR "hemophilic arthropathy" OR "haemophilic arthropathy")'],
        ['ITP beyond TPO-RAs', '((BTK OR FcRn OR "neonatal Fc receptor" OR SYK) AND "immune thrombocytopenia")']
      ],
      pros: ['Haem-A-QoL', 'Haemo-QoL', 'FACIT-Fatigue', 'ASCQ-Me', 'PROMIS', 'EQ-5D', 'SF-36', 'EORTC QLQ-C30', 'ITP-PAQ'],
      endpoints: [
        [/annuali[sz]ed (treated )?bleed|\bABR\b/i, 'Annualized bleeding rate'],
        [/factor (viii|ix) (activity|level|expression)/i, 'Factor activity'],
        [/vaso[- ]?occlusive|\bVOC\b|\bVOE\b|pain cris/i, 'Vaso-occlusive events'],
        [/transfusion[- ](independence|burden|avoidance|free|requirement)/i, 'Transfusion independence / burden'],
        [/breakthrough ha?emolysis/i, 'Breakthrough hemolysis'],
        [/\bLDH\b|lactate dehydrogenase|ha?emolysis/i, 'LDH / hemolysis'],
        [/platelet (response|count)|durable response/i, 'Platelet response'],
        [/ha?emoglobin|\bHb\b/i, 'Hemoglobin'],
        [/ferritin|transferrin saturation|\bTSAT\b|iron stores/i, 'Iron parameters']
      ],
      elig: [
        [/inhibitors? (to|against) factor|with(out)? inhibitors|Bethesda/i, 'FVIII / FIX inhibitor status'],
        [/\bAAV\b|anti-AAV|neutrali[sz]ing antibod/i, 'AAV antibodies / prior gene therapy'],
        [/vaso[- ]?occlusive|\bVOC/i, 'VOC history threshold'],
        [/transfusion[- ]dependen|\bN?TDT\b/i, 'Transfusion dependence'],
        [/hydroxyurea|hydroxycarbamide/i, 'Hydroxyurea use'],
        [/platelet count/i, 'Platelet count threshold'],
        [/meningococc|vaccinat/i, 'Meningococcal vaccination'],
        [/ha?emoglobin|\bHb\b/i, 'Hemoglobin threshold']
      ],
      gaps: [
        ['breakthrough', 'Breakthrough bleeding / hemolysis', '("breakthrough bleeding" OR "breakthrough bleeds" OR "breakthrough hemolysis" OR "breakthrough haemolysis")'],
        ['switching', 'Switching between prophylaxis or complement agents', '((switching OR switch OR transition) AND (prophylaxis OR emicizumab OR "extended half-life" OR "C5 inhibitor"))'],
        ['lmic', 'Low-resource settings', '("low-income" OR "low- and middle-income" OR "sub-Saharan Africa" OR LMIC OR LMICs)']
      ],
      pops: [
        ['women', 'Women and girls with bleeding disorders', '("women with hemophilia" OR "women with haemophilia" OR "hemophilia carriers" OR "haemophilia carriers" OR "women and girls with bleeding disorders")', '"hemophilia carriers"[tiab] OR "women with hemophilia"[tiab]'],
        ['inhib', 'Hemophilia with inhibitors', '("with inhibitors" AND (hemophilia OR haemophilia))', '"with inhibitors"[tiab] AND hemophilia[tiab]']
      ]
    },
  {
      id: 'CV', name: 'Cardiovascular', short: 'Cardiovascular',
      desc: 'Heart failure, lipids and Lp(a), atrial fibrillation, hypertension, ATTR-CM, HCM and PAH',
      fedTerms: ['cardiovascular'],
      specialties: 'cardi|vascular|electrophysiolog',
      inds: [
        { id: 'HF', name: 'Heart failure', short: 'heart failure', abbr: ['hf', 'hfref', 'hfpef', 'hfmref'], syn: ['cardiac failure', 'congestive heart failure'], epmc: '("heart failure" OR "cardiac failure" OR HFrEF OR HFpEF)', ct: 'heart failure', re: /heart failure|cardiac failure|HFrEF|HFpEF|HFmrEF/i, label: /heart failure/i, core: true },
        { id: 'LIPID', name: 'Hypercholesterolemia / ASCVD', short: 'hypercholesterolemia', abbr: ['ldl', 'ldl-c', 'ascvd', 'hefh', 'hofh'], syn: ['hyperlipidemia', 'dyslipidemia', 'atherosclerotic cardiovascular disease', 'familial hypercholesterolemia'], epmc: '(hypercholesterolemia OR hypercholesterolaemia OR "LDL cholesterol" OR "atherosclerotic cardiovascular disease")', ct: 'hypercholesterolemia', re: /hypercholesterol|hyperlipid|dyslipid|\bLDL|atherosclerotic cardiovascular|\bASCVD\b/i, label: /hyperlipidemia|hypercholesterolemia|LDL-C|low-density lipoprotein/i, core: true },
        { id: 'AF', name: 'Atrial fibrillation', short: 'atrial fibrillation', abbr: ['af', 'afib', 'nvaf'], syn: ['atrial flutter', 'nonvalvular atrial fibrillation'], epmc: '("atrial fibrillation")', ct: 'atrial fibrillation', re: /atrial fibrillation|atrial flutter/i, label: /atrial fibrillation/i, core: true },
        { id: 'LPA', name: 'Elevated lipoprotein(a)', short: 'elevated lipoprotein(a)', abbr: ['lp(a)', 'lpa'], syn: ['lipoprotein(a)', 'lipoprotein a'], epmc: '("lipoprotein(a)" OR "lipoprotein a" OR "Lp(a)")', ct: 'lipoprotein(a)', re: /lipoprotein\s*\(a\)|lipoprotein a\b|\bLp\(a\)/i, label: /lipoprotein\s*\(a\)/i },
        { id: 'HTN', name: 'Hypertension', short: 'hypertension', abbr: ['htn', 'rhtn'], syn: ['high blood pressure', 'resistant hypertension', 'uncontrolled hypertension'], epmc: '(hypertension NOT ("pulmonary hypertension" OR "pulmonary arterial hypertension" OR "portal hypertension" OR "intracranial hypertension" OR "ocular hypertension"))', ct: 'hypertension', re: /hypertension|high blood pressure/i, not: /(pulmonary|portal|intracranial|ocular)( arterial)? hypertension/i, label: /hypertension/i },
        { id: 'ATTRCM', name: 'Transthyretin amyloid cardiomyopathy', short: 'transthyretin amyloid cardiomyopathy', abbr: ['attr-cm', 'attrcm', 'attr'], syn: ['cardiac amyloidosis', 'transthyretin amyloidosis', 'wild-type attr'], epmc: '("transthyretin amyloid cardiomyopathy" OR "ATTR-CM" OR "ATTR cardiomyopathy" OR ("cardiac amyloidosis" AND transthyretin))', ct: 'transthyretin amyloid cardiomyopathy', re: /ATTR-?CM|cardiac amyloid|transthyretin.{0,40}cardiomyopath|cardiomyopath.{0,40}transthyretin/i, label: /ATTR-CM|cardiomyopathy of .{0,40}transthyretin/i },
        { id: 'HCM', name: 'Hypertrophic cardiomyopathy', short: 'hypertrophic cardiomyopathy', abbr: ['hcm', 'ohcm', 'nhcm'], syn: ['obstructive hypertrophic cardiomyopathy'], epmc: '("hypertrophic cardiomyopathy")', ct: 'hypertrophic cardiomyopathy', re: /hypertrophic cardiomyopathy|\bo?HCM\b/i, label: /hypertrophic cardiomyopathy/i },
        { id: 'PAH', name: 'Pulmonary arterial hypertension', short: 'pulmonary arterial hypertension', abbr: ['pah'], syn: ['pulmonary hypertension'], epmc: '("pulmonary arterial hypertension")', ct: 'pulmonary arterial hypertension', re: /pulmonary (arterial )?hypertension/i, label: /pulmonary arterial hypertension/i }
      ],
      assets: [
        { id: 'sacubitrilvalsartan', name: 'Sacubitril/valsartan', brand: 'ENTRESTO', generic: 'sacubitril and valsartan', company: 'Novartis', moa: 'ARNI (neprilysin inhibitor + ARB)', grp: 'RAAS / aldosterone', route: 'Oral', codes: ['LCZ696'], inds: ['HF'], epmc: '(sacubitril OR LCZ696)', intr: 'sacubitril OR LCZ696', sponsor: 'novartis' },
        { id: 'dapagliflozin', name: 'Dapagliflozin', brand: 'FARXIGA', company: 'AstraZeneca', moa: 'SGLT2 inhibitor', grp: 'SGLT2', route: 'Oral', inds: ['HF'], sponsor: 'astrazeneca' },
        { id: 'empagliflozin', name: 'Empagliflozin', brand: 'JARDIANCE', company: 'Boehringer Ingelheim / Lilly', moa: 'SGLT2 inhibitor', grp: 'SGLT2', route: 'Oral', inds: ['HF'], sponsor: 'boehringer|lilly' },
        { id: 'finerenone', name: 'Finerenone', brand: 'KERENDIA', company: 'Bayer', moa: 'Non-steroidal MR antagonist', grp: 'RAAS / aldosterone', route: 'Oral', codes: ['BAY 94-8862'], inds: ['HF'], sponsor: 'bayer' },
        { id: 'baxdrostat', name: 'Baxdrostat', company: 'AstraZeneca', moa: 'Aldosterone synthase inhibitor', grp: 'RAAS / aldosterone', route: 'Oral', codes: ['CIN-107'], inds: ['HTN'], sponsor: 'astrazeneca|cincor' },
        { id: 'lorundrostat', name: 'Lorundrostat', company: 'Mineralys Therapeutics', moa: 'Aldosterone synthase inhibitor', grp: 'RAAS / aldosterone', route: 'Oral', codes: ['MLS-101'], inds: ['HTN'], sponsor: 'mineralys' },
        { id: 'ziltivekimab', name: 'Ziltivekimab', company: 'Novo Nordisk', moa: 'Anti-IL-6 mAb', grp: 'Inflammation', route: 'Injectable', inds: ['HF', 'LIPID'], sponsor: 'novo nordisk' },
        { id: 'evolocumab', name: 'Evolocumab', brand: 'REPATHA', company: 'Amgen', moa: 'PCSK9 mAb', grp: 'PCSK9', route: 'Injectable', codes: ['AMG 145'], inds: ['LIPID'], sponsor: 'amgen' },
        { id: 'alirocumab', name: 'Alirocumab', brand: 'PRALUENT', company: 'Regeneron / Sanofi', moa: 'PCSK9 mAb', grp: 'PCSK9', route: 'Injectable', codes: ['REGN727', 'SAR236553'], inds: ['LIPID'], sponsor: 'regeneron|sanofi' },
        { id: 'inclisiran', name: 'Inclisiran', brand: 'LEQVIO', company: 'Novartis', moa: 'PCSK9 siRNA', grp: 'PCSK9', route: 'Injectable', inds: ['LIPID'], sponsor: 'novartis|medicines company' },
        { id: 'enlicitide', name: 'Enlicitide (MK-0616)', short: 'Enlicitide', company: 'Merck', moa: 'Oral macrocyclic peptide PCSK9 inhibitor', grp: 'PCSK9', route: 'Oral', codes: ['MK-0616'], inds: ['LIPID'], sponsor: 'merck sharp|msd' },
        { id: 'bempedoicacid', name: 'Bempedoic acid', brand: 'NEXLETOL', generic: 'bempedoic acid', company: 'Esperion', moa: 'ACL inhibitor', grp: 'Other LDL-C lowering', route: 'Oral', codes: ['ETC-1002'], inds: ['LIPID'], epmc: '("bempedoic acid" OR ETC-1002)', intr: '"bempedoic acid"', sponsor: 'esperion' },
        { id: 'obicetrapib', name: 'Obicetrapib', company: 'NewAmsterdam Pharma / Menarini', moa: 'CETP inhibitor', grp: 'Other LDL-C lowering', route: 'Oral', codes: ['TA-8995'], inds: ['LIPID'], sponsor: 'newamsterdam|menarini' },
        { id: 'pelacarsen', name: 'Pelacarsen', company: 'Novartis / Ionis', moa: 'Apo(a) antisense oligonucleotide', grp: 'Lp(a)', route: 'Injectable', codes: ['TQJ230'], inds: ['LPA'], sponsor: 'novartis|ionis|akcea' },
        { id: 'olpasiran', name: 'Olpasiran', company: 'Amgen', moa: 'Apo(a) siRNA', grp: 'Lp(a)', route: 'Injectable', codes: ['AMG 890'], inds: ['LPA'], sponsor: 'amgen' },
        { id: 'lepodisiran', name: 'Lepodisiran', company: 'Lilly', moa: 'Apo(a) siRNA', grp: 'Lp(a)', route: 'Injectable', codes: ['LY3819469'], inds: ['LPA'], sponsor: 'lilly' },
        { id: 'apixaban', name: 'Apixaban', brand: 'ELIQUIS', company: 'BMS / Pfizer', moa: 'Factor Xa inhibitor', grp: 'Factor Xa', route: 'Oral', inds: ['AF'], sponsor: 'bristol|pfizer' },
        { id: 'rivaroxaban', name: 'Rivaroxaban', brand: 'XARELTO', company: 'Johnson & Johnson / Bayer', moa: 'Factor Xa inhibitor', grp: 'Factor Xa', route: 'Oral', inds: ['AF'], sponsor: 'janssen|johnson|bayer' },
        { id: 'abelacimab', name: 'Abelacimab', company: 'Novartis (Anthos)', moa: 'Factor XI/XIa mAb', grp: 'Factor XI', route: 'Injectable', codes: ['MAA868'], inds: ['AF'], sponsor: 'anthos|novartis' },
        { id: 'milvexian', name: 'Milvexian', company: 'BMS / Johnson & Johnson', moa: 'Oral factor XIa inhibitor', grp: 'Factor XI', route: 'Oral', codes: ['BMS-986177', 'JNJ-70033093'], inds: ['AF'], sponsor: 'bristol|janssen|johnson' },
        { id: 'aprocitentan', name: 'Aprocitentan', brand: 'TRYVIO', company: 'Idorsia', moa: 'Dual endothelin receptor antagonist', grp: 'Endothelin', route: 'Oral', codes: ['ACT-132577'], inds: ['HTN'], sponsor: 'idorsia|actelion' },
        { id: 'tafamidis', name: 'Tafamidis', brand: 'VYNDAMAX', company: 'Pfizer', moa: 'TTR stabilizer', grp: 'TTR', route: 'Oral', inds: ['ATTRCM'], sponsor: 'pfizer|foldrx' },
        { id: 'acoramidis', name: 'Acoramidis', brand: 'ATTRUBY', company: 'BridgeBio', moa: 'TTR stabilizer', grp: 'TTR', route: 'Oral', codes: ['AG10'], inds: ['ATTRCM'], sponsor: 'bridgebio|eidos' },
        { id: 'vutrisiran', name: 'Vutrisiran', brand: 'AMVUTTRA', company: 'Alnylam', moa: 'TTR siRNA', grp: 'TTR', route: 'Injectable', inds: ['ATTRCM'], sponsor: 'alnylam' },
        { id: 'eplontersen', name: 'Eplontersen', brand: 'WAINUA', company: 'AstraZeneca / Ionis', moa: 'TTR antisense oligonucleotide', grp: 'TTR', route: 'Injectable', codes: ['ION-682884'], inds: ['ATTRCM'], sponsor: 'ionis|astrazeneca|akcea' },
        { id: 'mavacamten', name: 'Mavacamten', brand: 'CAMZYOS', company: 'BMS', moa: 'Cardiac myosin inhibitor', grp: 'Myosin', route: 'Oral', codes: ['MYK-461'], inds: ['HCM'], sponsor: 'bristol|myokardia' },
        { id: 'aficamten', name: 'Aficamten', company: 'Cytokinetics', moa: 'Cardiac myosin inhibitor', grp: 'Myosin', route: 'Oral', codes: ['CK-274'], inds: ['HCM'], sponsor: 'cytokinetics' },
        { id: 'sotatercept', name: 'Sotatercept', brand: 'WINREVAIR', company: 'Merck', moa: 'Activin signaling inhibitor', grp: 'PAH anti-remodeling', route: 'Injectable', codes: ['MK-7962', 'ACE-011'], inds: ['PAH'], sponsor: 'merck sharp|msd|acceleron' },
        { id: 'seralutinib', name: 'Seralutinib', company: 'Gossamer Bio / Chiesi', moa: 'Inhaled PDGFR / CSF1R / c-KIT kinase inhibitor', grp: 'PAH anti-remodeling', route: 'Inhaled', codes: ['GB002'], inds: ['PAH'], sponsor: 'gossamer' },
        { id: 'macitentan', name: 'Macitentan', brand: 'OPSUMIT', company: 'Johnson & Johnson', moa: 'Endothelin receptor antagonist', grp: 'Endothelin', route: 'Oral', codes: ['ACT-064992'], inds: ['PAH'], sponsor: 'actelion|janssen|johnson' }
      ],
      guides: [
        ['ACC / AHA', '("American College of Cardiology" OR "American Heart Association")', 'https://www.acc.org/guidelines', ['US']],
        ['Heart Failure Society of America', '"Heart Failure Society of America"', 'https://hfsa.org/', ['US']],
        ['National Lipid Association', '"National Lipid Association"', 'https://www.lipid.org/', ['US']],
        ['Canadian Cardiovascular Society', '"Canadian Cardiovascular Society"', 'https://ccs.ca/', ['CA']],
        ['European Society of Cardiology', '"European Society of Cardiology"', 'https://www.escardio.org/Guidelines', ['EU']],
        ['European Atherosclerosis Society', '"European Atherosclerosis Society"', 'https://eas-society.org/', ['EU']],
        ['European Society of Hypertension', '"European Society of Hypertension"', 'https://www.eshonline.org/', ['EU']],
        ['Deutsche Gesellschaft für Kardiologie', '"Deutsche Gesellschaft für Kardiologie"', 'https://dgk.org/', ['DE']],
        ['Japanese Circulation Society', '"Japanese Circulation Society"', 'https://www.j-circ.or.jp/', ['JP']],
        ['CSANZ', '("Cardiac Society of Australia and New Zealand" OR CSANZ)', 'https://www.csanz.edu.au/', ['AU']]
      ],
      congresses: [
        ['ACC', 'American College of Cardiology Annual Scientific Session', 'https://www.acc.org/'],
        ['AHA', 'American Heart Association Scientific Sessions', 'https://professional.heart.org/'],
        ['ESC', 'ESC Congress', 'https://www.escardio.org/'],
        ['HFA', 'ESC Heart Failure Congress', 'https://www.escardio.org/'],
        ['HFSA', 'HFSA Annual Scientific Meeting', 'https://hfsa.org/'],
        ['EAS', 'European Atherosclerosis Society Congress', 'https://eas-society.org/'],
        ['NLA', 'National Lipid Association Scientific Sessions', 'https://www.lipid.org/'],
        ['HRS', 'Heart Rhythm (Heart Rhythm Society)', 'https://www.hrsonline.org/'],
        ['ESH', 'European Society of Hypertension Meeting', 'https://www.eshonline.org/'],
        ['TCT', 'Transcatheter Cardiovascular Therapeutics', 'https://www.crf.org/tct']
      ],
      advocacy: [
        ['American Heart Association', 'Professional society', ['*'], 'https://www.heart.org'],
        ['Mended Hearts', 'Patient advocacy', ['HF'], 'https://mendedhearts.org'],
        ['Family Heart Foundation', 'Patient advocacy', ['LIPID', 'LPA'], 'https://familyheart.org'],
        ['StopAfib.org', 'Patient advocacy', ['AF'], 'https://www.stopafib.org'],
        ['Amyloidosis Research Consortium', 'Patient advocacy', ['ATTRCM'], 'https://arci.org'],
        ['Amyloidosis Foundation', 'Patient advocacy', ['ATTRCM'], 'https://amyloidosis.org'],
        ['Hypertrophic Cardiomyopathy Association', 'Patient advocacy', ['HCM'], 'https://4hcm.org'],
        ['Pulmonary Hypertension Association', 'Patient advocacy', ['PAH'], 'https://phassociation.org']
      ],
      themes: [
        ['Obesity-related HFpEF', '((HFpEF OR "preserved ejection fraction") AND (obesity OR semaglutide OR tirzepatide OR incretin))'],
        ['Factor XI inhibition', '("factor XI" OR "factor XIa" OR abelacimab OR milvexian OR asundexian)'],
        ['Lp(a) outcome trials', '(("lipoprotein(a)" OR "Lp(a)") AND (outcome* OR "cardiovascular events"))'],
        ['Oral PCSK9 and CETP inhibition', '("oral PCSK9" OR enlicitide OR obicetrapib OR "CETP inhibitor")'],
        ['Aldosterone synthase inhibition', '("aldosterone synthase" OR baxdrostat OR lorundrostat)'],
        ['RNA therapeutics in CV', '((siRNA OR "small interfering RNA" OR antisense) AND (cardiovascular OR cholesterol OR lipoprotein OR transthyretin))'],
        ['Inflammation and residual risk', '(("residual inflammatory risk" OR "interleukin-6" OR ziltivekimab OR colchicine) AND cardiovascular)'],
        ['ATTR-CM early diagnosis', '((transthyretin OR ATTR) AND (screening OR "early diagnosis" OR scintigraphy OR "artificial intelligence"))'],
        ['Cardiac myosin inhibition', '("cardiac myosin inhibitor" OR mavacamten OR aficamten)'],
        ['Cardiovascular-kidney-metabolic health', '("cardiovascular-kidney-metabolic" OR "cardio-kidney-metabolic" OR cardiorenal)']
      ],
      pros: ['KCCQ', 'MLHFQ', 'SAQ', 'AFEQT', 'emPHasis-10', 'EQ-5D', 'SF-36', 'PGI-S', 'PGIC', 'PROMIS'],
      endpoints: [[/MACE|major adverse cardiovascular/i, 'MACE'], [/cardiovascular death|CV death|hospitali[sz]ation for heart failure|heart failure (event|hospitali)|worsening heart failure/i, 'CV death / HF events'], [/stroke|systemic embol/i, 'Stroke / systemic embolism'], [/bleed/i, 'Bleeding'], [/lipoprotein\s*\(a\)|\bLp\(a\)/i, 'Lp(a)'], [/\bLDL|low-density lipoprotein/i, 'LDL-C'], [/blood pressure|\bSBP\b|systolic/i, 'Blood pressure'], [/peak VO2|pVO2|oxygen (uptake|consumption)|LVOT|outflow tract gradient/i, 'pVO2 / LVOT gradient'], [/6-?minute walk|\b6MWD\b|\b6MWT\b/i, '6-minute walk'], [/KCCQ/i, 'KCCQ'], [/NT-?proBNP|natriuretic/i, 'NT-proBNP'], [/all-cause mortality|death from any cause/i, 'All-cause mortality']],
      elig: [[/LVEF|ejection fraction/i, 'LVEF threshold'], [/NYHA/i, 'NYHA class'], [/NT-?proBNP|\bBNP\b/i, 'Natriuretic peptide threshold'], [/\bLDL/i, 'LDL-C threshold'], [/statin/i, 'Background statin therapy'], [/CHA2DS2|CHADS/i, 'CHA2DS2-VASc score'], [/systolic blood pressure|\bSBP\b/i, 'Blood pressure threshold'], [/eGFR/i, 'eGFR threshold']],
      gaps: [
        ['hfpef', 'HFpEF', '(HFpEF OR "preserved ejection fraction")'],
        ['ckd', 'CKD comorbidity', '("chronic kidney disease" OR eGFR OR dialysis)'],
        ['gdmt', 'GDMT uptake', '("guideline-directed medical therapy" OR GDMT OR undertreatment OR underuse)']
      ],
      pops: [
        ['women', 'Women', '(women OR female OR "sex differences")', 'women[tiab] OR "sex differences"[tiab]'],
        ['black', 'Black patients', '("Black patients" OR "African American")', '"Black patients"[tiab] OR "African American"[tiab]']
      ]
    },
    {
      id: 'METAB', name: 'Metabolic & endocrinology', short: 'Metabolic',
      desc: 'Diabetes, obesity, MASH, osteoporosis, severe hypertriglyceridemia and rare endocrine disease',
      fedTerms: ['diabetes', 'obesity'],
      specialties: 'endocrin|diabet|metabol|obesity|lipid',
      inds: [
        { id: 'T2D', name: 'Type 2 diabetes', short: 'type 2 diabetes', abbr: ['t2d', 't2dm'], syn: ['type 2 diabetes mellitus', 'diabetes mellitus type 2', 'non-insulin-dependent diabetes'], epmc: '("type 2 diabetes" OR "type 2 diabetes mellitus" OR T2DM)', ct: 'type 2 diabetes', re: /type\s*2 diabetes|type II diabetes|diabetes mellitus,? type\s*2|\bT2DM?\b|non-insulin-dependent/i, label: /type 2 diabetes/i, core: true },
        { id: 'OB', name: 'Obesity / overweight', short: 'obesity', abbr: ['ob'], syn: ['overweight', 'chronic weight management', 'weight management'], epmc: '(obesity OR overweight OR "weight management")', ct: 'obesity', re: /obes|overweight|weight management/i, label: /obesity|overweight|weight management|excess body weight/i, core: true },
        { id: 'MASH', name: 'MASH', short: 'metabolic dysfunction-associated steatohepatitis', abbr: ['mash', 'nash', 'masld', 'nafld'], syn: ['nonalcoholic steatohepatitis', 'fatty liver disease'], epmc: '("metabolic dysfunction-associated steatohepatitis" OR MASH OR "nonalcoholic steatohepatitis" OR "non-alcoholic steatohepatitis" OR NASH)', ct: 'nonalcoholic steatohepatitis', re: /steatohepatitis|\bMASH\b|\bNASH\b|\bMASLD\b|\bNAFLD\b|fatty liver/i, label: /steatohepatitis|\bMASH\b|\bNASH\b/i, core: true },
        { id: 'T1D', name: 'Type 1 diabetes', short: 'type 1 diabetes', abbr: ['t1d', 't1dm'], syn: ['type 1 diabetes mellitus', 'juvenile diabetes'], epmc: '("type 1 diabetes" OR "type 1 diabetes mellitus" OR T1DM)', ct: 'type 1 diabetes', re: /type\s*1 diabetes|type I diabetes|diabetes mellitus,? type\s*1|\bT1DM?\b/i, label: /type 1 diabetes/i },
        { id: 'OSTEO', name: 'Osteoporosis', short: 'osteoporosis', abbr: ['op', 'pmo'], syn: ['postmenopausal osteoporosis', 'low bone mineral density'], epmc: '(osteoporosis OR osteoporotic)', ct: 'osteoporosis', re: /osteoporo/i, label: /osteoporosis/i },
        { id: 'HTG', name: 'Hypertriglyceridemia / FCS', short: 'hypertriglyceridemia', abbr: ['htg', 'shtg', 'fcs'], syn: ['severe hypertriglyceridemia', 'familial chylomicronemia syndrome', 'chylomicronemia'], epmc: '(hypertriglyceridemia OR hypertriglyceridaemia OR "familial chylomicronemia syndrome" OR chylomicronemia OR chylomicronaemia)', ct: 'hypertriglyceridemia', re: /hypertriglycerid|chylomicron/i, label: /hypertriglycerid|chylomicron|triglyceride/i },
        { id: 'GHD', name: 'Growth hormone deficiency', short: 'growth hormone deficiency', abbr: ['ghd', 'aghd', 'pghd'], syn: ['pediatric growth hormone deficiency', 'adult growth hormone deficiency'], epmc: '("growth hormone deficiency")', ct: 'growth hormone deficiency', re: /growth hormone deficien/i, label: /growth hormone deficiency|inadequate secretion of endogenous (growth hormone|GH)/i },
        { id: 'HYPOPARA', name: 'Hypoparathyroidism', short: 'hypoparathyroidism', abbr: ['hp'], syn: ['chronic hypoparathyroidism'], epmc: '(hypoparathyroidism)', ct: 'hypoparathyroidism', re: /hypoparathyroid/i, not: /pseudohypoparathyroid/i, label: /hypoparathyroidism/i }
      ],
      assets: [
        { id: 'semaglutide', name: 'Semaglutide (injectable)', short: 'Semaglutide', brand: 'OZEMPIC', company: 'Novo Nordisk', moa: 'GLP-1 receptor agonist', grp: 'GLP-1 / incretin', route: 'Injectable', inds: ['T2D', 'OB', 'MASH'], sponsor: 'novo nordisk', labelRoute: 'SUBCUTANEOUS' },
        { id: 'oralsemaglutide', name: 'Semaglutide (oral)', short: 'Semaglutide', brand: 'RYBELSUS', generic: 'semaglutide', company: 'Novo Nordisk', moa: 'Oral GLP-1 receptor agonist', grp: 'GLP-1 / incretin', route: 'Oral', inds: ['T2D', 'OB'], epmc: '("oral semaglutide" OR Rybelsus)', intr: '"oral semaglutide"', sponsor: 'novo nordisk', labelRoute: 'ORAL' },
        { id: 'tirzepatide', name: 'Tirzepatide', brand: 'MOUNJARO', company: 'Lilly', moa: 'GIP / GLP-1 receptor agonist', grp: 'GLP-1 / incretin', route: 'Injectable', codes: ['LY3298176'], inds: ['T2D', 'OB'], sponsor: 'lilly' },
        { id: 'dulaglutide', name: 'Dulaglutide', brand: 'TRULICITY', company: 'Lilly', moa: 'GLP-1 receptor agonist', grp: 'GLP-1 / incretin', route: 'Injectable', inds: ['T2D'], sponsor: 'lilly' },
        { id: 'retatrutide', name: 'Retatrutide', company: 'Lilly', moa: 'GIP / GLP-1 / glucagon receptor agonist', grp: 'GLP-1 / incretin', route: 'Injectable', codes: ['LY3437943'], inds: ['OB', 'T2D'], sponsor: 'lilly' },
        { id: 'orforglipron', name: 'Orforglipron', company: 'Lilly', moa: 'Oral non-peptide GLP-1 receptor agonist', grp: 'GLP-1 / incretin', route: 'Oral', codes: ['LY3502970'], inds: ['OB', 'T2D'], sponsor: 'lilly' },
        { id: 'survodutide', name: 'Survodutide', company: 'Boehringer Ingelheim / Zealand', moa: 'Glucagon / GLP-1 receptor agonist', grp: 'GLP-1 / incretin', route: 'Injectable', codes: ['BI 456906'], inds: ['OB', 'MASH'], sponsor: 'boehringer|zealand' },
        { id: 'maridebartcafraglutide', name: 'Maridebart cafraglutide (MariTide)', short: 'MariTide', company: 'Amgen', moa: 'GIPR antagonist / GLP-1 agonist antibody-peptide conjugate', grp: 'GLP-1 / incretin', route: 'Injectable', codes: ['AMG 133'], inds: ['OB', 'T2D'], epmc: '("maridebart cafraglutide" OR MariTide OR "AMG 133")', intr: '"maridebart cafraglutide" OR MariTide OR "AMG 133"', sponsor: 'amgen' },
        { id: 'cagrisema', name: 'Cagrilintide/semaglutide (CagriSema)', short: 'CagriSema', company: 'Novo Nordisk', moa: 'Amylin analogue + GLP-1 receptor agonist', grp: 'Amylin', route: 'Injectable', inds: ['OB', 'T2D'], epmc: '(CagriSema OR cagrilintide)', intr: 'CagriSema OR cagrilintide', sponsor: 'novo nordisk' },
        { id: 'empagliflozin', name: 'Empagliflozin', brand: 'JARDIANCE', company: 'Boehringer Ingelheim / Lilly', moa: 'SGLT2 inhibitor', grp: 'SGLT2', route: 'Oral', inds: ['T2D'], sponsor: 'boehringer|lilly' },
        { id: 'dapagliflozin', name: 'Dapagliflozin', brand: 'FARXIGA', company: 'AstraZeneca', moa: 'SGLT2 inhibitor', grp: 'SGLT2', route: 'Oral', inds: ['T2D'], sponsor: 'astrazeneca' },
        { id: 'insulinicodec', name: 'Insulin icodec', short: 'Icodec', company: 'Novo Nordisk', moa: 'Once-weekly basal insulin analogue', grp: 'Insulin', route: 'Injectable', inds: ['T2D', 'T1D'], epmc: '("insulin icodec" OR icodec)', intr: '"insulin icodec"', sponsor: 'novo nordisk' },
        { id: 'efsitora', name: 'Insulin efsitora alfa', short: 'Efsitora', company: 'Lilly', moa: 'Once-weekly basal insulin Fc-fusion', grp: 'Insulin', route: 'Injectable', codes: ['LY3209590'], inds: ['T2D', 'T1D'], epmc: '(efsitora OR LY3209590)', intr: 'efsitora OR LY3209590', sponsor: 'lilly' },
        { id: 'teplizumab', name: 'Teplizumab', brand: 'TZIELD', company: 'Sanofi', moa: 'Anti-CD3 mAb', grp: 'T1D disease-modifying', route: 'Intravenous', codes: ['PRV-031'], inds: ['T1D'], sponsor: 'provention|sanofi|macrogenics' },
        { id: 'zimislecel', name: 'Zimislecel (VX-880)', short: 'Zimislecel', company: 'Vertex', moa: 'Stem cell-derived islet cell therapy', grp: 'T1D disease-modifying', route: 'Intravenous', codes: ['VX-880'], inds: ['T1D'], sponsor: 'vertex' },
        { id: 'resmetirom', name: 'Resmetirom', brand: 'REZDIFFRA', company: 'Madrigal', moa: 'THR-β agonist', grp: 'Nuclear receptor (THR-β / PPAR)', route: 'Oral', codes: ['MGL-3196'], inds: ['MASH'], sponsor: 'madrigal' },
        { id: 'lanifibranor', name: 'Lanifibranor', company: 'Inventiva', moa: 'Pan-PPAR agonist', grp: 'Nuclear receptor (THR-β / PPAR)', route: 'Oral', codes: ['IVA337'], inds: ['MASH'], sponsor: 'inventiva' },
        { id: 'efruxifermin', name: 'Efruxifermin', company: 'Novo Nordisk (Akero)', moa: 'FGF21 analogue (Fc-fusion)', grp: 'FGF21', route: 'Injectable', codes: ['AKR-001'], inds: ['MASH'], sponsor: 'akero|novo nordisk' },
        { id: 'pegozafermin', name: 'Pegozafermin', company: 'Roche (89bio)', moa: 'Glycopegylated FGF21 analogue', grp: 'FGF21', route: 'Injectable', codes: ['BIO89-100'], inds: ['MASH', 'HTG'], sponsor: '89bio|hoffmann|roche' },
        { id: 'denosumab', name: 'Denosumab', brand: 'PROLIA', company: 'Amgen', moa: 'Anti-RANKL mAb', grp: 'Bone', route: 'Injectable', codes: ['AMG 162'], inds: ['OSTEO'], sponsor: 'amgen' },
        { id: 'romosozumab', name: 'Romosozumab', brand: 'EVENITY', company: 'Amgen / UCB', moa: 'Anti-sclerostin mAb', grp: 'Bone', route: 'Injectable', inds: ['OSTEO'], sponsor: 'amgen|ucb' },
        { id: 'abaloparatide', name: 'Abaloparatide', brand: 'TYMLOS', company: 'Radius Health', moa: 'PTHrP analogue (anabolic)', grp: 'Bone', route: 'Injectable', inds: ['OSTEO'], sponsor: 'radius' },
        { id: 'olezarsen', name: 'Olezarsen', brand: 'TRYNGOLZA', company: 'Ionis', moa: 'APOC3 antisense oligonucleotide', grp: 'APOC3', route: 'Injectable', inds: ['HTG'], sponsor: 'ionis|akcea' },
        { id: 'plozasiran', name: 'Plozasiran', brand: 'REDEMPLO', company: 'Arrowhead', moa: 'APOC3 siRNA', grp: 'APOC3', route: 'Injectable', codes: ['ARO-APOC3'], inds: ['HTG'], sponsor: 'arrowhead' },
        { id: 'somapacitan', name: 'Somapacitan', brand: 'SOGROYA', company: 'Novo Nordisk', moa: 'Once-weekly GH (albumin-binding)', grp: 'Growth hormone', route: 'Injectable', inds: ['GHD'], sponsor: 'novo nordisk' },
        { id: 'lonapegsomatropin', name: 'Lonapegsomatropin', brand: 'SKYTROFA', company: 'Ascendis Pharma', moa: 'Once-weekly GH prodrug (TransCon)', grp: 'Growth hormone', route: 'Injectable', inds: ['GHD'], sponsor: 'ascendis' },
        { id: 'somatrogon', name: 'Somatrogon', brand: 'NGENLA', company: 'Pfizer / OPKO', moa: 'Once-weekly GH (CTP fusion)', grp: 'Growth hormone', route: 'Injectable', codes: ['MOD-4023'], inds: ['GHD'], sponsor: 'pfizer|opko' },
        { id: 'palopegteriparatide', name: 'Palopegteriparatide', brand: 'YORVIPATH', company: 'Ascendis Pharma', moa: 'PTH(1-34) prodrug (TransCon)', grp: 'PTH', route: 'Injectable', codes: ['TransCon PTH'], inds: ['HYPOPARA'], sponsor: 'ascendis' },
        { id: 'eneboparatide', name: 'Eneboparatide', company: 'AstraZeneca (Amolyt)', moa: 'PTH1 receptor agonist', grp: 'PTH', route: 'Injectable', codes: ['AZP-3601'], inds: ['HYPOPARA'], sponsor: 'amolyt|astrazeneca' }
      ],
      guides: [
        ['American Diabetes Association', '("American Diabetes Association" OR "Standards of Care in Diabetes")', 'https://professional.diabetes.org/', ['US']],
        ['AACE', '("American Association of Clinical Endocrinology" OR "American Association of Clinical Endocrinologists")', 'https://pro.aace.com/', ['US']],
        ['Endocrine Society', '"Endocrine Society"', 'https://www.endocrine.org/clinical-practice-guidelines', ['US']],
        ['AASLD', '"American Association for the Study of Liver Diseases"', 'https://www.aasld.org/practice-guidelines', ['US']],
        ['Bone Health & Osteoporosis Foundation', '("Bone Health and Osteoporosis Foundation" OR "National Osteoporosis Foundation")', 'https://www.bonehealthandosteoporosis.org/', ['US']],
        ['Diabetes Canada', '"Diabetes Canada"', 'https://guidelines.diabetes.ca/', ['CA']],
        ['Obesity Canada', '"Obesity Canada"', 'https://obesitycanada.ca/', ['CA']],
        ['EASD', '"European Association for the Study of Diabetes"', 'https://www.easd.org/', ['EU']],
        ['EASO', '"European Association for the Study of Obesity"', 'https://easo.org/', ['EU']],
        ['Japan Diabetes Society', '"Japan Diabetes Society"', 'https://www.jds.or.jp/', ['JP']]
      ],
      congresses: [
        ['ADA', 'ADA Scientific Sessions', 'https://professional.diabetes.org/'],
        ['EASD', 'EASD Annual Meeting', 'https://www.easd.org/'],
        ['ObesityWeek', 'ObesityWeek', 'https://obesityweek.org/'],
        ['ECO', 'European Congress on Obesity', 'https://easo.org/'],
        ['ENDO', 'Endocrine Society Annual Meeting', 'https://www.endocrine.org/'],
        ['ATTD', 'Advanced Technologies & Treatments for Diabetes', 'https://attd.kenes.com/'],
        ['AACE', 'AACE Annual Meeting', 'https://pro.aace.com/'],
        ['ECE', 'European Congress of Endocrinology', 'https://www.ese-hormones.org/'],
        ['ASBMR', 'ASBMR Annual Meeting', 'https://www.asbmr.org/'],
        ['The Liver Meeting', 'AASLD The Liver Meeting', 'https://www.aasld.org/'],
        ['IDF', 'IDF World Diabetes Congress', 'https://idf.org/']
      ],
      advocacy: [
        ['American Diabetes Association', 'Patient advocacy', ['T2D', 'T1D'], 'https://diabetes.org'],
        ['Breakthrough T1D', 'Patient advocacy', ['T1D'], 'https://www.breakthrought1d.org'],
        ['Obesity Action Coalition', 'Patient advocacy', ['OB'], 'https://www.obesityaction.org'],
        ['The Obesity Society', 'Professional society', ['OB'], 'https://www.obesity.org'],
        ['Global Liver Institute', 'Patient advocacy', ['MASH'], 'https://globalliver.org'],
        ['Bone Health & Osteoporosis Foundation', 'Patient advocacy', ['OSTEO'], 'https://www.bonehealthandosteoporosis.org'],
        ['MAGIC Foundation', 'Patient advocacy', ['GHD'], 'https://www.magicfoundation.org'],
        ['HypoPARAthyroidism Association', 'Patient advocacy', ['HYPOPARA'], 'https://hypopara.org'],
        ['Endocrine Society', 'Professional society', ['*'], 'https://www.endocrine.org']
      ],
      themes: [
        ['Lean mass on incretin therapy', '((GLP-1 OR incretin OR semaglutide OR tirzepatide) AND ("lean mass" OR "muscle mass" OR "body composition" OR sarcopenia))'],
        ['Oral small-molecule GLP-1', '(orforglipron OR "oral GLP-1" OR "small-molecule GLP-1")'],
        ['Triple agonists and amylin', '(retatrutide OR cagrilintide OR amylin OR "triple agonist")'],
        ['Weight regain after discontinuation', '(("weight regain" OR discontinuation OR "weight maintenance") AND (obesity OR GLP-1))'],
        ['Once-weekly insulin', '("once-weekly insulin" OR "insulin icodec" OR efsitora)'],
        ['T1D immunotherapy and islet replacement', '(teplizumab OR "beta-cell preservation" OR "islet transplantation" OR "stem cell-derived islet")'],
        ['MASH non-invasive tests', '((MASH OR NASH OR steatohepatitis) AND ("non-invasive test" OR elastography OR FIB-4 OR "liver stiffness"))'],
        ['Incretins beyond metabolism', '((GLP-1 OR semaglutide OR tirzepatide) AND (alcohol OR addiction OR "substance use" OR Alzheimer*))'],
        ['Osteoporosis treatment gap after fracture', '("fracture liaison" OR "osteoporosis treatment gap" OR "imminent fracture risk")']
      ],
      pros: ['IWQOL-Lite-CT', 'IWQOL-Lite', 'DTSQ', 'Diabetes Distress Scale', 'HFS', 'COEQ', 'SF-36', 'EQ-5D', 'PGI-S', 'QUALEFFO'],
      endpoints: [[/MACE|major adverse cardiovascular/i, 'MACE'], [/C-peptide/i, 'C-peptide'], [/time in range|\bTIR\b|CGM/i, 'Time in range (CGM)'], [/HbA1c|\bA1c\b|glycated|glycosylated/i, 'HbA1c'], [/fibrosis|steatohepatitis|NASH resolution|MASH resolution|histolog/i, 'MASH histology'], [/liver fat|PDFF/i, 'Liver fat (MRI-PDFF)'], [/body weight|weight (loss|change|reduction)|\bBMI\b/i, 'Body weight'], [/fracture/i, 'Fracture'], [/\bBMD\b|bone mineral density/i, 'BMD'], [/triglycerid/i, 'Triglycerides'], [/height velocity|annuali[sz]ed height/i, 'Height velocity'], [/serum calcium|albumin-adjusted calcium|albumin-corrected calcium|independence from conventional/i, 'Calcium / independence from conventional therapy']],
      elig: [[/HbA1c|\bA1c\b/i, 'HbA1c range'], [/\bBMI\b|body mass index/i, 'BMI threshold'], [/metformin/i, 'Background metformin'], [/insulin/i, 'Insulin use rules'], [/eGFR/i, 'eGFR threshold'], [/fibrosis stage|\bF[1-4]\b|liver biopsy/i, 'Fibrosis stage (biopsy)'], [/T-score|\bBMD\b/i, 'BMD T-score'], [/triglycerid/i, 'Triglyceride threshold']],
      gaps: [
        ['muscle', 'Muscle and body composition', '("lean mass" OR "muscle mass" OR "body composition" OR sarcopenia)'],
        ['discont', 'Discontinuation and weight regain', '("weight regain" OR discontinuation OR "treatment cessation")'],
        ['cvot', 'Cardiovascular outcomes', '("cardiovascular outcome*" OR MACE)']
      ],
      pops: [['asian', 'Asian populations', '("South Asian" OR "East Asian" OR Asian)', '"South Asian"[tiab] OR Asian[tiab]']]
    },
    {
      id: 'RENAL', name: 'Nephrology', short: 'Nephrology',
      desc: 'CKD, glomerular disease, lupus nephritis, anemia of CKD, hyperkalemia and ADPKD',
      fedTerms: ['kidney'],
      specialties: 'nephrolog|transplant',
      inds: [
        { id: 'CKD', name: 'Chronic kidney disease', short: 'chronic kidney disease', abbr: ['ckd', 'dkd'], syn: ['diabetic kidney disease', 'diabetic nephropathy', 'chronic renal insufficiency'], epmc: '("chronic kidney disease" OR "diabetic kidney disease" OR "diabetic nephropathy")', ct: 'chronic kidney disease', re: /chronic kidney|chronic renal (insufficiency|failure|disease)|diabetic kidney|diabetic nephropath|\bCKD\b|renal insufficiency, chronic|kidney failure, chronic/i, label: /chronic kidney disease/i, core: true },
        { id: 'IgAN', name: 'IgA nephropathy', short: 'IgA nephropathy', abbr: ['igan'], syn: ['immunoglobulin a nephropathy'], epmc: '("IgA nephropathy" OR "immunoglobulin A nephropathy")', ct: 'IgA nephropathy', re: /IgA nephropath|immunoglobulin A nephropath|\bIgAN\b/i, label: /IgA nephropathy|immunoglobulin A nephropathy/i, core: true },
        { id: 'LN', name: 'Lupus nephritis', short: 'lupus nephritis', abbr: ['ln'], syn: ['sle nephritis'], epmc: '("lupus nephritis")', ct: 'lupus nephritis', re: /lupus nephritis/i, label: /lupus nephritis/i, core: true },
        { id: 'FSGS', name: 'Focal segmental glomerulosclerosis', short: 'focal segmental glomerulosclerosis', abbr: ['fsgs'], syn: ['nephrotic syndrome'], epmc: '("focal segmental glomerulosclerosis" OR FSGS)', ct: 'focal segmental glomerulosclerosis', re: /focal segmental glomerulosclerosis|\bFSGS\b/i, label: /focal segmental glomerulosclerosis|\bFSGS\b/i },
        { id: 'ANEMIA', name: 'Anemia of CKD', short: 'anemia of chronic kidney disease', abbr: ['ackd'], syn: ['renal anemia', 'anaemia of ckd'], epmc: '((anemia OR anaemia) AND ("chronic kidney disease" OR dialysis OR renal))', ct: 'anemia in chronic kidney disease', re: /(anemia|anaemia).{0,40}(kidney|renal|\bCKD\b|dialysis)|(renal|\bCKD\b).{0,20}(anemia|anaemia)/i, label: /anemia due to (chronic kidney disease|CKD)|anemia.{0,30}chronic kidney/i },
        { id: 'HK', name: 'Hyperkalemia', short: 'hyperkalemia', abbr: ['hk'], syn: ['hyperkalaemia', 'high potassium'], epmc: '(hyperkalemia OR hyperkalaemia)', ct: 'hyperkalemia', re: /hyperkal/i, label: /hyperkal/i },
        { id: 'ADPKD', name: 'Autosomal dominant polycystic kidney disease', short: 'polycystic kidney disease', abbr: ['adpkd', 'pkd'], syn: ['polycystic kidney disease'], epmc: '("polycystic kidney disease" OR ADPKD)', ct: 'polycystic kidney disease', re: /polycystic kidney|\bADPKD\b/i, label: /polycystic kidney/i },
        { id: 'C3G', name: 'C3 glomerulopathy', short: 'C3 glomerulopathy', abbr: ['c3g', 'ic-mpgn'], syn: ['dense deposit disease', 'c3 glomerulonephritis', 'immune-complex membranoproliferative glomerulonephritis'], epmc: '("C3 glomerulopathy" OR "dense deposit disease" OR "C3 glomerulonephritis")', ct: 'C3 glomerulopathy', re: /C3 glomerul|dense deposit disease|\bC3G\b|immune[- ]complex membranoproliferative|IC-MPGN/i, label: /C3 glomerulopathy|\bC3G\b/i }
      ],
      assets: [
        { id: 'dapagliflozin', name: 'Dapagliflozin', brand: 'FARXIGA', company: 'AstraZeneca', moa: 'SGLT2 inhibitor', grp: 'SGLT2', route: 'Oral', inds: ['CKD'], sponsor: 'astrazeneca' },
        { id: 'empagliflozin', name: 'Empagliflozin', brand: 'JARDIANCE', company: 'Boehringer Ingelheim / Lilly', moa: 'SGLT2 inhibitor', grp: 'SGLT2', route: 'Oral', inds: ['CKD'], sponsor: 'boehringer|lilly' },
        { id: 'finerenone', name: 'Finerenone', brand: 'KERENDIA', company: 'Bayer', moa: 'Non-steroidal MR antagonist', grp: 'Aldosterone / MR', route: 'Oral', codes: ['BAY 94-8862'], inds: ['CKD'], sponsor: 'bayer' },
        { id: 'baxdrostat', name: 'Baxdrostat', company: 'AstraZeneca', moa: 'Aldosterone synthase inhibitor', grp: 'Aldosterone / MR', route: 'Oral', codes: ['CIN-107'], inds: ['CKD'], sponsor: 'astrazeneca|cincor' },
        { id: 'semaglutide', name: 'Semaglutide (injectable)', short: 'Semaglutide', brand: 'OZEMPIC', company: 'Novo Nordisk', moa: 'GLP-1 receptor agonist', grp: 'GLP-1 / incretin', route: 'Injectable', inds: ['CKD'], sponsor: 'novo nordisk', labelRoute: 'SUBCUTANEOUS' },
        { id: 'zibotentan', name: 'Zibotentan/dapagliflozin', short: 'Zibotentan', company: 'AstraZeneca', moa: 'Endothelin A antagonist + SGLT2 inhibitor', grp: 'Endothelin', route: 'Oral', codes: ['ZD4054'], inds: ['CKD'], sponsor: 'astrazeneca' },
        { id: 'sparsentan', name: 'Sparsentan', brand: 'FILSPARI', company: 'Travere', moa: 'Dual endothelin / angiotensin receptor antagonist', grp: 'Endothelin', route: 'Oral', codes: ['RE-021'], inds: ['IgAN', 'FSGS'], sponsor: 'travere|retrophin' },
        { id: 'atrasentan', name: 'Atrasentan', brand: 'VANRAFIA', company: 'Novartis', moa: 'Endothelin A receptor antagonist', grp: 'Endothelin', route: 'Oral', inds: ['IgAN'], sponsor: 'novartis|chinook' },
        { id: 'inaxaplin', name: 'Inaxaplin', company: 'Vertex', moa: 'APOL1 inhibitor', grp: 'APOL1', route: 'Oral', codes: ['VX-147'], inds: ['CKD'], sponsor: 'vertex' },
        { id: 'budesonidetrf', name: 'Budesonide (targeted-release)', short: 'Budesonide', brand: 'TARPEYO', company: 'Calliditas (Asahi Kasei)', moa: 'Gut-targeted release corticosteroid', grp: 'Immunomodulation', route: 'Oral', codes: ['Nefecon'], inds: ['IgAN'], epmc: '(Nefecon OR (budesonide AND "IgA nephropathy"))', intr: 'Nefecon OR budesonide', sponsor: 'calliditas' },
        { id: 'iptacopan', name: 'Iptacopan', brand: 'FABHALTA', company: 'Novartis', moa: 'Factor B inhibitor', grp: 'Complement', route: 'Oral', codes: ['LNP023'], inds: ['IgAN', 'C3G'], sponsor: 'novartis' },
        { id: 'pegcetacoplan', name: 'Pegcetacoplan', brand: 'EMPAVELI', company: 'Apellis', moa: 'C3 inhibitor', grp: 'Complement', route: 'Injectable', codes: ['APL-2'], inds: ['C3G'], sponsor: 'apellis', labelRoute: 'SUBCUTANEOUS' },
        { id: 'ravulizumab', name: 'Ravulizumab', brand: 'ULTOMIRIS', company: 'AstraZeneca (Alexion)', moa: 'C5 inhibitor', grp: 'Complement', route: 'Intravenous', codes: ['ALXN1210'], inds: ['IgAN'], sponsor: 'alexion|astrazeneca' },
        { id: 'sibeprenlimab', name: 'Sibeprenlimab', company: 'Otsuka', moa: 'Anti-APRIL mAb', grp: 'B cell / APRIL / BAFF', route: 'Injectable', codes: ['VIS649'], inds: ['IgAN'], sponsor: 'otsuka|visterra' },
        { id: 'atacicept', name: 'Atacicept', company: 'Vera Therapeutics', moa: 'TACI-Fc (BAFF / APRIL inhibitor)', grp: 'B cell / APRIL / BAFF', route: 'Injectable', inds: ['IgAN'], sponsor: 'vera therapeutics' },
        { id: 'povetacicept', name: 'Povetacicept', company: 'Vertex', moa: 'Dual BAFF / APRIL inhibitor', grp: 'B cell / APRIL / BAFF', route: 'Injectable', codes: ['ALPN-303'], inds: ['IgAN'], sponsor: 'vertex|alpine' },
        { id: 'belimumab', name: 'Belimumab', brand: 'BENLYSTA', company: 'GSK', moa: 'Anti-BLyS (BAFF) mAb', grp: 'B cell / APRIL / BAFF', route: 'Injectable', inds: ['LN'], sponsor: 'glaxo|gsk|human genome' },
        { id: 'obinutuzumab', name: 'Obinutuzumab', brand: 'GAZYVA', company: 'Roche (Genentech)', moa: 'Anti-CD20 mAb', grp: 'B cell / APRIL / BAFF', route: 'Intravenous', inds: ['LN'], sponsor: 'hoffmann|roche|genentech' },
        { id: 'voclosporin', name: 'Voclosporin', brand: 'LUPKYNIS', company: 'Aurinia', moa: 'Calcineurin inhibitor', grp: 'Immunomodulation', route: 'Oral', inds: ['LN'], sponsor: 'aurinia' },
        { id: 'anifrolumab', name: 'Anifrolumab', brand: 'SAPHNELO', company: 'AstraZeneca', moa: 'Type I interferon receptor mAb', grp: 'Immunomodulation', route: 'Intravenous', codes: ['MEDI-546'], inds: ['LN'], sponsor: 'astrazeneca|medimmune' },
        { id: 'vadadustat', name: 'Vadadustat', brand: 'VAFSEO', company: 'Akebia', moa: 'HIF-PH inhibitor', grp: 'Anemia (HIF-PH / ESA)', route: 'Oral', codes: ['AKB-6548'], inds: ['ANEMIA'], sponsor: 'akebia' },
        { id: 'darbepoetinalfa', name: 'Darbepoetin alfa', short: 'Darbepoetin', brand: 'ARANESP', generic: 'darbepoetin alfa', company: 'Amgen', moa: 'Erythropoiesis-stimulating agent', grp: 'Anemia (HIF-PH / ESA)', route: 'Injectable', inds: ['ANEMIA'], sponsor: 'amgen' },
        { id: 'patiromer', name: 'Patiromer', brand: 'VELTASSA', company: 'CSL Vifor', moa: 'Potassium binder (polymer)', grp: 'Potassium binder', route: 'Oral', codes: ['RLY5016'], inds: ['HK'], sponsor: 'relypsa|vifor' },
        { id: 'sodiumzirconiumcyclosilicate', name: 'Sodium zirconium cyclosilicate', short: 'SZC', brand: 'LOKELMA', generic: 'sodium zirconium cyclosilicate', company: 'AstraZeneca', moa: 'Potassium binder (selective cation exchanger)', grp: 'Potassium binder', route: 'Oral', codes: ['ZS-9'], inds: ['HK'], epmc: '("sodium zirconium cyclosilicate" OR ZS-9 OR Lokelma)', intr: '"sodium zirconium cyclosilicate"', sponsor: 'astrazeneca|zs pharma' },
        { id: 'tolvaptan', name: 'Tolvaptan', brand: 'JYNARQUE', company: 'Otsuka', moa: 'Vasopressin V2 receptor antagonist', grp: 'Vasopressin V2', route: 'Oral', codes: ['OPC-41061'], inds: ['ADPKD'], sponsor: 'otsuka' }
      ],
      guides: [
        ['KDIGO', 'KDIGO', 'https://kdigo.org/guidelines/', ['*']],
        ['National Kidney Foundation (KDOQI)', '("National Kidney Foundation" OR KDOQI)', 'https://www.kidney.org/', ['US']],
        ['American College of Rheumatology (lupus nephritis)', '"American College of Rheumatology"', 'https://rheumatology.org/', ['US']],
        ['Canadian Society of Nephrology', '"Canadian Society of Nephrology"', 'https://www.csnscn.ca/', ['CA']],
        ['UK Kidney Association', '("UK Kidney Association" OR "Renal Association")', 'https://ukkidney.org/', ['GB']],
        ['European Renal Association', '("European Renal Association" OR "European Renal Best Practice")', 'https://www.era-online.org/', ['EU']],
        ['EULAR (lupus nephritis)', '(EULAR OR "European Alliance of Associations for Rheumatology")', 'https://www.eular.org/', ['EU']],
        ['Japanese Society of Nephrology', '"Japanese Society of Nephrology"', 'https://jsn.or.jp/', ['JP']]
      ],
      congresses: [
        ['Kidney Week', 'ASN Kidney Week', 'https://www.asn-online.org/education/kidneyweek/'],
        ['ERA', 'European Renal Association Congress', 'https://www.era-online.org/'],
        ['NKF SCM', 'NKF Spring Clinical Meetings', 'https://www.kidney.org/'],
        ['WCN', 'ISN World Congress of Nephrology', 'https://www.theisn.org/'],
        ['ACR Convergence', 'American College of Rheumatology Convergence', 'https://rheumatology.org/'],
        ['EULAR', 'EULAR Congress', 'https://www.eular.org/'],
        ['JSN', 'Japanese Society of Nephrology Annual Meeting', 'https://jsn.or.jp/']
      ],
      advocacy: [
        ['National Kidney Foundation', 'Patient advocacy', ['*'], 'https://www.kidney.org'],
        ['American Kidney Fund', 'Patient advocacy', ['*'], 'https://www.kidneyfund.org'],
        ['IgA Nephropathy Foundation', 'Patient advocacy', ['IgAN'], 'https://igan.org'],
        ['NephCure', 'Patient advocacy', ['FSGS', 'IgAN', 'C3G'], 'https://nephcure.org'],
        ['Lupus Foundation of America', 'Patient advocacy', ['LN'], 'https://www.lupus.org'],
        ['PKD Foundation', 'Patient advocacy', ['ADPKD'], 'https://pkdcure.org'],
        ['American Society of Nephrology', 'Professional society', ['*'], 'https://www.asn-online.org']
      ],
      themes: [
        ['APRIL / BAFF in IgA nephropathy', '((APRIL OR BAFF OR TACI OR sibeprenlimab OR atacicept OR povetacicept) AND "IgA nephropathy")'],
        ['Complement in glomerular disease', '((complement OR iptacopan OR pegcetacoplan OR ravulizumab) AND (glomerulopathy OR glomerulonephritis OR nephropathy))'],
        ['Endothelin antagonism', '("endothelin receptor antagonist" OR sparsentan OR atrasentan OR zibotentan)'],
        ['Combined pillars of CKD therapy', '((SGLT2 OR finerenone OR GLP-1) AND "chronic kidney disease" AND (combination OR pillar*))'],
        ['Proteinuria and eGFR slope as surrogates', '((proteinuria OR albuminuria OR UPCR OR UACR OR "eGFR slope") AND "surrogate endpoint")'],
        ['APOL1-mediated kidney disease', '(APOL1)'],
        ['Aldosterone synthase inhibition in CKD', '("aldosterone synthase" AND kidney)'],
        ['CKD screening and early detection', '((albuminuria OR UACR) AND (screening OR "early detection") AND kidney)'],
        ['Potassium binders enabling RAAS inhibition', '((hyperkalemia OR hyperkalaemia) AND ("RAAS inhibitor" OR RAASi OR "renin-angiotensin"))']
      ],
      pros: ['KDQOL-36', 'KDQOL-SF', 'FACIT-Fatigue', 'LupusQoL', 'SF-36', 'EQ-5D', 'PROMIS', 'PGI-S'],
      endpoints: [[/C3 deposit|glomerular C3|C3c/i, 'C3 deposits (histology)'], [/total kidney volume|\bTKV\b|htTKV/i, 'Total kidney volume'], [/renal response|\bCRR\b|\bPRR\b/i, 'Renal response (LN)'], [/kidney failure|end-stage kidney|end-stage renal|\bESKD\b|\bESRD\b|sustained (decline|decrease) in eGFR|(40|50|57)% (decline|decrease|reduction)/i, 'Kidney composite outcome'], [/eGFR slope|GFR slope/i, 'eGFR slope'], [/proteinuria|UPCR|protein.{0,10}creatinine/i, 'Proteinuria (UPCR)'], [/albuminuria|UACR|albumin.{0,10}creatinine/i, 'Albuminuria (UACR)'], [/remission/i, 'Proteinuria remission'], [/hemoglobin|haemoglobin|\bHb\b/i, 'Hemoglobin'], [/potassium|normokal/i, 'Serum potassium'], [/eGFR|glomerular filtration/i, 'eGFR change']],
      elig: [[/eGFR|glomerular filtration/i, 'eGFR threshold'], [/UPCR|proteinuria|protein.{0,10}creatinine/i, 'Proteinuria threshold'], [/UACR|albuminuria/i, 'Albuminuria threshold'], [/biopsy/i, 'Biopsy-proven disease'], [/ACE inhibitor|\bACEi\b|\bARB\b|RAS (inhibit|blockade)|renin-angiotensin/i, 'Background RAS blockade'], [/dialysis/i, 'Dialysis status'], [/potassium/i, 'Potassium threshold'], [/hemoglobin|haemoglobin/i, 'Hemoglobin threshold']],
      gaps: [
        ['tx', 'Kidney transplant recipients', '("kidney transplant" OR "renal transplant")'],
        ['early', 'Early-stage CKD', '(("early-stage" OR "stage 1" OR "stage 2") AND "chronic kidney disease")'],
        ['hard', 'Hard kidney outcomes', '("kidney failure" OR "end-stage kidney disease" OR ESKD OR "eGFR slope")']
      ],
      pops: [
        ['dialysis', 'Patients on dialysis', '(dialysis OR hemodialysis OR haemodialysis)', 'dialysis[tiab] OR hemodialysis[tiab]'],
        ['apol1', 'Black patients and APOL1 variants', '(APOL1 OR "African American" OR "Black patients")', 'APOL1[tiab] OR "African American"[tiab]']
      ]
    },
    {
      id: 'GI', name: 'Gastroenterology & hepatology', short: 'GI & liver',
      desc: 'IBD, eosinophilic esophagitis, celiac disease, PBC, IBS and acid-related disease',
      fedTerms: ['gastrointestinal'],
      specialties: 'gastroenterolog|hepatolog|colon',
      inds: [
        { id: 'UC', name: 'Ulcerative colitis', short: 'ulcerative colitis', abbr: ['uc'], syn: ['colitis ulcerosa'], epmc: '("ulcerative colitis")', ct: 'ulcerative colitis', re: /ulcerative colitis|colitis,? ulcerative/i, label: /ulcerative colitis/i, core: true },
        { id: 'CD', name: "Crohn's disease", short: "Crohn's disease", abbr: ['cd'], syn: ['crohn disease', 'regional enteritis'], epmc: '("Crohn\'s disease" OR "Crohn disease")', ct: 'Crohn disease', re: /crohn/i, label: /crohn/i, core: true },
        { id: 'EoE', name: 'Eosinophilic esophagitis', short: 'eosinophilic esophagitis', abbr: ['eoe'], syn: ['eosinophilic oesophagitis'], epmc: '("eosinophilic esophagitis" OR "eosinophilic oesophagitis")', ct: 'eosinophilic esophagitis', re: /eosinophilic o?esophagitis|\bEoE\b/i, label: /eosinophilic esophagitis/i, core: true },
        { id: 'CeD', name: 'Celiac disease', short: 'celiac disease', abbr: ['ced'], syn: ['coeliac disease', 'gluten-sensitive enteropathy'], epmc: '("celiac disease" OR "coeliac disease")', ct: 'celiac disease', re: /c(o)?eliac (disease|sprue)|gluten-sensitive enteropathy/i, label: /celiac disease/i },
        { id: 'PBC', name: 'Primary biliary cholangitis', short: 'primary biliary cholangitis', abbr: ['pbc'], syn: ['primary biliary cirrhosis'], epmc: '("primary biliary cholangitis" OR "primary biliary cirrhosis")', ct: 'primary biliary cholangitis', re: /primary biliary|\bPBC\b/i, label: /primary biliary/i },
        { id: 'IBS', name: 'Irritable bowel syndrome', short: 'irritable bowel syndrome', abbr: ['ibs', 'ibs-c', 'ibs-d'], syn: ['irritable bowel'], epmc: '("irritable bowel syndrome")', ct: 'irritable bowel syndrome', re: /irritable bowel/i, label: /irritable bowel/i },
        { id: 'GERD', name: 'Erosive esophagitis / GERD', short: 'gastroesophageal reflux disease', abbr: ['gerd', 'gord', 'ee', 'nerd'], syn: ['erosive esophagitis', 'reflux esophagitis', 'heartburn'], epmc: '("gastroesophageal reflux" OR "gastro-oesophageal reflux" OR "erosive esophagitis" OR "reflux esophagitis")', ct: 'gastroesophageal reflux disease', re: /gastro-?o?esophageal reflux|erosive o?esophagitis|reflux o?esophagitis|\bGERD\b|\bGORD\b/i, label: /erosive esophagitis|gastroesophageal reflux/i }
      ],
      assets: [
        { id: 'risankizumab', name: 'Risankizumab', brand: 'SKYRIZI', company: 'AbbVie', moa: 'IL-23p19 inhibitor', grp: 'IL-23', route: 'Injectable', inds: ['CD', 'UC'], sponsor: 'abbvie|boehringer' },
        { id: 'guselkumab', name: 'Guselkumab', brand: 'TREMFYA', company: 'Johnson & Johnson', moa: 'IL-23p19 inhibitor', grp: 'IL-23', route: 'Injectable', inds: ['UC', 'CD'], sponsor: 'janssen|johnson' },
        { id: 'mirikizumab', name: 'Mirikizumab', brand: 'OMVOH', company: 'Lilly', moa: 'IL-23p19 inhibitor', grp: 'IL-23', route: 'Injectable', codes: ['LY3074828'], inds: ['UC', 'CD'], sponsor: 'lilly' },
        { id: 'ustekinumab', name: 'Ustekinumab', brand: 'STELARA', company: 'Johnson & Johnson', moa: 'IL-12/23 p40 inhibitor', grp: 'IL-23', route: 'Injectable', inds: ['CD', 'UC'], sponsor: 'janssen|johnson|centocor' },
        { id: 'upadacitinib', name: 'Upadacitinib', brand: 'RINVOQ', company: 'AbbVie', moa: 'JAK1 inhibitor', grp: 'JAK', route: 'Oral', inds: ['UC', 'CD'], sponsor: 'abbvie', labelRoute: 'ORAL' },
        { id: 'tofacitinib', name: 'Tofacitinib', brand: 'XELJANZ', company: 'Pfizer', moa: 'JAK inhibitor', grp: 'JAK', route: 'Oral', codes: ['CP-690550'], inds: ['UC'], sponsor: 'pfizer' },
        { id: 'vedolizumab', name: 'Vedolizumab', brand: 'ENTYVIO', company: 'Takeda', moa: 'α4β7 integrin mAb', grp: 'Integrin / S1P', route: 'Injectable', inds: ['UC', 'CD'], sponsor: 'takeda|millennium' },
        { id: 'etrasimod', name: 'Etrasimod', brand: 'VELSIPITY', company: 'Pfizer', moa: 'S1P receptor modulator', grp: 'Integrin / S1P', route: 'Oral', codes: ['APD334'], inds: ['UC'], sponsor: 'pfizer|arena' },
        { id: 'ozanimod', name: 'Ozanimod', brand: 'ZEPOSIA', company: 'BMS', moa: 'S1P receptor modulator', grp: 'Integrin / S1P', route: 'Oral', codes: ['RPC1063'], inds: ['UC', 'CD'], sponsor: 'bristol|celgene|receptos' },
        { id: 'adalimumab', name: 'Adalimumab', brand: 'HUMIRA', company: 'AbbVie', moa: 'Anti-TNF mAb', grp: 'Anti-TNF', route: 'Injectable', inds: ['UC', 'CD'], sponsor: 'abbvie|abbott' },
        { id: 'tulisokibart', name: 'Tulisokibart', company: 'Merck', moa: 'Anti-TL1A mAb', grp: 'TL1A', route: 'Injectable', codes: ['MK-7240', 'PRA023'], inds: ['UC', 'CD'], sponsor: 'merck sharp|msd|prometheus' },
        { id: 'duvakitug', name: 'Duvakitug', company: 'Sanofi / Teva', moa: 'Anti-TL1A mAb', grp: 'TL1A', route: 'Injectable', codes: ['TEV-48574'], inds: ['UC', 'CD'], sponsor: 'sanofi|teva' },
        { id: 'afimkibart', name: 'Afimkibart', company: 'Roche', moa: 'Anti-TL1A mAb', grp: 'TL1A', route: 'Injectable', codes: ['RVT-3101', 'RG6631'], inds: ['UC', 'CD'], sponsor: 'hoffmann|roche|roivant|telavant' },
        { id: 'obefazimod', name: 'Obefazimod', company: 'Abivax', moa: 'miR-124 enhancer', grp: 'Other oral', route: 'Oral', codes: ['ABX464'], inds: ['UC'], sponsor: 'abivax' },
        { id: 'dupilumab', name: 'Dupilumab', brand: 'DUPIXENT', company: 'Sanofi / Regeneron', moa: 'IL-4Rα antagonist', grp: 'IL-4R / IL-13', route: 'Injectable', inds: ['EoE'], sponsor: 'regeneron|sanofi' },
        { id: 'cendakimab', name: 'Cendakimab', company: 'BMS', moa: 'Anti-IL-13 mAb', grp: 'IL-4R / IL-13', route: 'Injectable', codes: ['CC-93538'], inds: ['EoE'], sponsor: 'bristol|celgene' },
        { id: 'budesonideoral', name: 'Budesonide oral suspension', short: 'Budesonide', brand: 'EOHILIA', company: 'Takeda', moa: 'Swallowed topical corticosteroid', grp: 'Corticosteroid', route: 'Oral', codes: ['TAK-721'], inds: ['EoE'], epmc: '(budesonide AND ("eosinophilic esophagitis" OR "eosinophilic oesophagitis"))', intr: 'budesonide OR TAK-721', sponsor: 'takeda|shire' },
        { id: 'seladelpar', name: 'Seladelpar', brand: 'LIVDELZI', company: 'Gilead', moa: 'PPARδ agonist', grp: 'Cholestatic (PPAR / IBAT)', route: 'Oral', codes: ['MBX-8025'], inds: ['PBC'], sponsor: 'gilead|cymabay' },
        { id: 'elafibranor', name: 'Elafibranor', brand: 'IQIRVO', company: 'Ipsen / GENFIT', moa: 'PPARα/δ agonist', grp: 'Cholestatic (PPAR / IBAT)', route: 'Oral', codes: ['GFT505'], inds: ['PBC'], sponsor: 'ipsen|genfit' },
        { id: 'linerixibat', name: 'Linerixibat', company: 'GSK', moa: 'IBAT inhibitor (cholestatic pruritus)', grp: 'Cholestatic (PPAR / IBAT)', route: 'Oral', codes: ['GSK2330672'], inds: ['PBC'], sponsor: 'glaxo|gsk' },
        { id: 'linaclotide', name: 'Linaclotide', brand: 'LINZESS', company: 'AbbVie / Ironwood', moa: 'Guanylate cyclase-C agonist', grp: 'IBS agents', route: 'Oral', inds: ['IBS'], sponsor: 'ironwood|abbvie|allergan|forest' },
        { id: 'tenapanor', name: 'Tenapanor', brand: 'IBSRELA', company: 'Ardelyx', moa: 'NHE3 inhibitor', grp: 'IBS agents', route: 'Oral', inds: ['IBS'], sponsor: 'ardelyx' },
        { id: 'rifaximin', name: 'Rifaximin', brand: 'XIFAXAN', company: 'Salix (Bausch Health)', moa: 'Gut-selective rifamycin antibiotic', grp: 'IBS agents', route: 'Oral', inds: ['IBS'], sponsor: 'salix|bausch' },
        { id: 'vonoprazan', name: 'Vonoprazan', brand: 'VOQUEZNA', company: 'Phathom', moa: 'Potassium-competitive acid blocker', grp: 'Acid suppression (P-CAB)', route: 'Oral', codes: ['TAK-438'], inds: ['GERD'], sponsor: 'phathom|takeda' }
      ],
      guides: [
        ['American College of Gastroenterology', '"American College of Gastroenterology"', 'https://gi.org/guidelines/', ['US']],
        ['American Gastroenterological Association', '"American Gastroenterological Association"', 'https://gastro.org/', ['US']],
        ['AASLD', '"American Association for the Study of Liver Diseases"', 'https://www.aasld.org/practice-guidelines', ['US']],
        ['Canadian Association of Gastroenterology', '"Canadian Association of Gastroenterology"', 'https://www.cag-acg.org/', ['CA']],
        ['British Society of Gastroenterology', '"British Society of Gastroenterology"', 'https://www.bsg.org.uk/', ['GB']],
        ['ECCO', '("European Crohn\'s and Colitis Organisation" OR ECCO)', 'https://www.ecco-ibd.eu/', ['EU']],
        ['EASL', '"European Association for the Study of the Liver"', 'https://easl.eu/', ['EU']],
        ['DGVS', '(DGVS OR "Deutsche Gesellschaft für Gastroenterologie")', 'https://www.dgvs.de/', ['DE']],
        ['Japanese Society of Gastroenterology', '"Japanese Society of Gastroenterology"', 'https://www.jsge.or.jp/', ['JP']]
      ],
      congresses: [
        ['DDW', 'Digestive Disease Week', 'https://ddw.org/'],
        ['UEGW', 'UEG Week', 'https://ueg.eu/week'],
        ['ECCO', 'ECCO Congress', 'https://www.ecco-ibd.eu/'],
        ['ACG', 'ACG Annual Scientific Meeting', 'https://gi.org/'],
        ["Crohn's & Colitis Congress", "Crohn's & Colitis Congress", 'https://www.crohnscolitisfoundation.org/'],
        ['The Liver Meeting', 'AASLD The Liver Meeting', 'https://www.aasld.org/'],
        ['EASL Congress', 'EASL Congress', 'https://easl.eu/']
      ],
      advocacy: [
        ["Crohn's & Colitis Foundation", 'Patient advocacy', ['UC', 'CD'], 'https://www.crohnscolitisfoundation.org'],
        ['EFCCA', 'Patient advocacy', ['UC', 'CD'], 'https://efcca.org'],
        ['APFED', 'Patient advocacy', ['EoE'], 'https://apfed.org'],
        ['Celiac Disease Foundation', 'Patient advocacy', ['CeD'], 'https://celiac.org'],
        ['Beyond Celiac', 'Patient advocacy', ['CeD'], 'https://www.beyondceliac.org'],
        ['PBCers Organization', 'Patient advocacy', ['PBC'], 'https://www.pbcers.org'],
        ['American Liver Foundation', 'Patient advocacy', ['PBC'], 'https://liverfoundation.org'],
        ['IFFGD', 'Patient advocacy', ['IBS', 'GERD'], 'https://iffgd.org']
      ],
      themes: [
        ['TL1A inhibition', '(TL1A OR tulisokibart OR duvakitug OR afimkibart)'],
        ['Advanced combination therapy in IBD', '(("combination therapy" OR "dual biologic" OR "advanced combination") AND ("inflammatory bowel disease" OR "ulcerative colitis" OR Crohn*))'],
        ['Oral small molecules in IBD', '((obefazimod OR "S1P receptor" OR etrasimod OR ozanimod OR "JAK inhibitor") AND ("ulcerative colitis" OR Crohn*))'],
        ['Histologic and endoscopic remission', '("histologic remission" OR "endoscopic remission" OR "mucosal healing" OR "disease clearance")'],
        ['Biomarkers and precision medicine in IBD', '((biomarker OR "precision medicine" OR "treatment selection") AND ("inflammatory bowel disease" OR IBD))'],
        ['Perianal fistulizing Crohn\'s', '("perianal fistula*" OR "fistulizing Crohn*" OR "perianal Crohn*")'],
        ['Second-line PPAR agonists in PBC', '((seladelpar OR elafibranor OR "PPAR agonist") AND "primary biliary")'],
        ['Cholestatic pruritus', '("cholestatic pruritus" OR (pruritus AND "primary biliary"))'],
        ['Gut-brain interaction', '("disorders of gut-brain interaction" OR "gut-brain axis" OR DGBI)']
      ],
      pros: ['IBDQ', 'SIBDQ', 'PRO2', 'DSQ', 'EEsAI', 'PBC-40', '5-D Itch', 'IBS-SSS', 'IBS-QOL', 'FACIT-Fatigue'],
      endpoints: [[/villous|villus|Vh:Cd/i, 'Mucosal histology (celiac)'], [/endoscopic (response|remission|improvement)|SES-CD|Mayo endoscopic|\bMES\b/i, 'Endoscopic'], [/corticosteroid-free|steroid-free/i, 'Steroid-free remission'], [/clinical remission|modified Mayo|Mayo score|\bCDAI\b|\bPRO2\b/i, 'Clinical remission'], [/eosinophil|eos\/hpf/i, 'Esophageal eosinophils'], [/histolog/i, 'Histologic'], [/dysphagia|\bDSQ\b/i, 'Dysphagia (DSQ)'], [/alkaline phosphatase|\bALP\b|biochemical response/i, 'ALP / biochemical response'], [/pruritus|itch/i, 'Pruritus'], [/healing of erosive|erosive esophagitis|heartburn/i, 'EE healing / heartburn'], [/abdominal pain|\bCSBM\b|bowel movement|stool consistency/i, 'IBS symptom response']],
      elig: [[/Mayo|SES-CD|\bCDAI\b/i, 'Disease activity score'], [/TNF|biologic|advanced therap/i, 'Prior biologic or advanced therapy'], [/corticosteroid|steroid/i, 'Corticosteroid rules'], [/eos\/hpf|eosinophil/i, 'Eosinophil threshold'], [/ursodeoxycholic|\bUDCA\b/i, 'Background UDCA'], [/alkaline phosphatase|\bALP\b/i, 'ALP threshold'], [/gluten/i, 'Gluten-free diet'], [/Rome (IV|criteria)/i, 'Rome IV criteria']],
      gaps: [
        ['fistula', 'Perianal fistulizing disease', '("perianal fistula*" OR fistulizing)'],
        ['eim', 'Extraintestinal manifestations', '("extraintestinal manifestation*" OR "extra-intestinal manifestation*")'],
        ['postop', 'Postoperative recurrence and pouchitis', '("postoperative recurrence" OR "post-operative recurrence" OR pouchitis)']
      ],
      pops: []
    },
  {
      id: 'NEURO', name: 'Neurology', short: 'Neurology',
      desc: 'Neurodegenerative, neuroimmunology, headache, epilepsy and neuromuscular disease',
      fedTerms: ['neurology', 'neurological'],
      specialties: 'neuro|epilep|sleep|pain',
      inds: [
        { id: 'MS', name: 'Multiple sclerosis', short: 'multiple sclerosis', abbr: ['ms', 'rrms', 'spms', 'ppms'], syn: ['relapsing multiple sclerosis', 'progressive multiple sclerosis'], epmc: '("multiple sclerosis")', ct: 'multiple sclerosis', re: /multiple sclerosis/i, label: /multiple sclerosis/i, core: true },
        { id: 'ALZ', name: 'Alzheimer\'s disease', short: 'Alzheimer\'s disease', abbr: ['ad'], syn: ['alzheimer disease', 'early alzheimer\'s disease', 'alzheimer dementia'], epmc: '("Alzheimer disease" OR "Alzheimer\'s disease" OR alzheimer)', ct: 'Alzheimer disease', re: /alzheimer/i, label: /alzheimer/i, core: true },
        { id: 'MIG', name: 'Migraine', short: 'migraine', abbr: [], syn: ['chronic migraine', 'episodic migraine'], epmc: '(migraine)', ct: 'migraine', re: /migraine/i, label: /migraine/i, core: true },
        { id: 'PD', name: 'Parkinson\'s disease', short: 'Parkinson\'s disease', abbr: ['pd'], syn: ['parkinson disease'], epmc: '("Parkinson disease" OR "Parkinson\'s disease")', ct: 'Parkinson disease', re: /parkinson/i, label: /parkinson/i },
        { id: 'EPI', name: 'Epilepsy', short: 'epilepsy', abbr: [], syn: ['seizures', 'focal seizures', 'dravet syndrome', 'lennox-gastaut syndrome'], epmc: '(epilepsy OR epileptic OR seizures)', ct: 'epilepsy', re: /epilep|seizure|lennox|dravet/i, not: /psychogenic non-?epileptic|functional seizure/i, label: /seizure|epilep/i },
        { id: 'GMG', name: 'Generalized myasthenia gravis', short: 'generalized myasthenia gravis', abbr: ['gmg', 'mg'], syn: ['myasthenia gravis'], epmc: '("myasthenia gravis")', ct: 'myasthenia gravis', re: /myasthenia/i, label: /myasthenia gravis/i },
        { id: 'SMA', name: 'Spinal muscular atrophy', short: 'spinal muscular atrophy', abbr: ['sma'], syn: [], epmc: '("spinal muscular atrophy")', ct: 'spinal muscular atrophy', re: /spinal muscular atroph/i, label: /spinal muscular atrophy/i },
        { id: 'ALS', name: 'Amyotrophic lateral sclerosis', short: 'amyotrophic lateral sclerosis', abbr: ['als', 'mnd'], syn: ['motor neuron disease', 'motor neurone disease'], epmc: '("amyotrophic lateral sclerosis" OR "motor neuron disease" OR "motor neurone disease")', ct: 'amyotrophic lateral sclerosis', re: /amyotrophic lateral|motou?r neuron(e)? disease/i, label: /amyotrophic lateral sclerosis/i },
        { id: 'CIDP', name: 'Chronic inflammatory demyelinating polyneuropathy', short: 'CIDP', abbr: ['cidp'], syn: ['chronic inflammatory demyelinating polyradiculoneuropathy'], epmc: '("chronic inflammatory demyelinating polyneuropathy" OR "chronic inflammatory demyelinating polyradiculoneuropathy" OR CIDP)', ct: 'chronic inflammatory demyelinating polyneuropathy', re: /chronic inflammatory demyelinating|\bCIDP\b/i, label: /chronic inflammatory demyelinating/i }
      ],
      assets: [
        { id: 'lecanemab', name: 'Lecanemab', brand: 'LEQEMBI', company: 'Eisai / Biogen', moa: 'Anti-amyloid-beta protofibril antibody', grp: 'Anti-amyloid', route: 'Intravenous', codes: ['BAN2401'], inds: ['ALZ'], sponsor: 'eisai|biogen' },
        { id: 'donanemab', name: 'Donanemab', brand: 'KISUNLA', company: 'Lilly', moa: 'Anti-N3pG amyloid plaque antibody', grp: 'Anti-amyloid', route: 'Intravenous', codes: ['LY3002813'], inds: ['ALZ'], sponsor: 'lilly' },
        { id: 'trontinemab', name: 'Trontinemab', company: 'Roche', moa: 'Brain Shuttle anti-amyloid-beta antibody (TfR1)', grp: 'Anti-amyloid', route: 'Intravenous', codes: ['RG6102'], inds: ['ALZ'], sponsor: 'hoffmann|roche|genentech' },
        { id: 'ocrelizumab', name: 'Ocrelizumab', brand: 'OCREVUS', company: 'Roche / Genentech', moa: 'Anti-CD20 antibody', grp: 'Anti-CD20', route: 'Intravenous', inds: ['MS'], sponsor: 'hoffmann|genentech|roche' },
        { id: 'ofatumumab', name: 'Ofatumumab', brand: 'KESIMPTA', company: 'Novartis', moa: 'Anti-CD20 antibody', grp: 'Anti-CD20', route: 'Injectable', codes: ['OMB157'], inds: ['MS'], sponsor: 'novartis', labelRoute: 'SUBCUTANEOUS', sibling: 'ARZERRA' },
        { id: 'ublituximab', name: 'Ublituximab', brand: 'BRIUMVI', company: 'TG Therapeutics', moa: 'Glycoengineered anti-CD20 antibody', grp: 'Anti-CD20', route: 'Intravenous', codes: ['TG-1101'], inds: ['MS'], sponsor: 'tg therapeutics' },
        { id: 'ozanimod', name: 'Ozanimod', brand: 'ZEPOSIA', company: 'BMS', moa: 'S1P1/S1P5 receptor modulator', grp: 'S1P', route: 'Oral', codes: ['RPC1063'], inds: ['MS'], sponsor: 'bristol|celgene|receptos' },
        { id: 'tolebrutinib', name: 'Tolebrutinib', company: 'Sanofi', moa: 'Brain-penetrant BTK inhibitor', grp: 'BTK', route: 'Oral', codes: ['SAR442168'], inds: ['MS'], sponsor: 'sanofi|genzyme' },
        { id: 'fenebrutinib', name: 'Fenebrutinib', company: 'Roche', moa: 'Reversible BTK inhibitor', grp: 'BTK', route: 'Oral', codes: ['GDC-0853'], inds: ['MS'], sponsor: 'hoffmann|genentech|roche' },
        { id: 'erenumab', name: 'Erenumab', brand: 'AIMOVIG', company: 'Amgen / Novartis', moa: 'Anti-CGRP receptor antibody', grp: 'CGRP', route: 'Injectable', codes: ['AMG 334'], inds: ['MIG'], sponsor: 'amgen|novartis' },
        { id: 'fremanezumab', name: 'Fremanezumab', brand: 'AJOVY', company: 'Teva', moa: 'Anti-CGRP ligand antibody', grp: 'CGRP', route: 'Injectable', codes: ['TEV-48125'], inds: ['MIG'], sponsor: 'teva' },
        { id: 'galcanezumab', name: 'Galcanezumab', brand: 'EMGALITY', company: 'Lilly', moa: 'Anti-CGRP ligand antibody', grp: 'CGRP', route: 'Injectable', codes: ['LY2951742'], inds: ['MIG'], sponsor: 'lilly' },
        { id: 'eptinezumab', name: 'Eptinezumab', brand: 'VYEPTI', company: 'Lundbeck', moa: 'Anti-CGRP ligand antibody', grp: 'CGRP', route: 'Intravenous', codes: ['ALD403'], inds: ['MIG'], sponsor: 'lundbeck|alder' },
        { id: 'rimegepant', name: 'Rimegepant', brand: 'NURTEC ODT', company: 'Pfizer', moa: 'CGRP receptor antagonist (gepant)', grp: 'CGRP', route: 'Oral', codes: ['BHV-3000'], inds: ['MIG'], sponsor: 'biohaven|pfizer' },
        { id: 'atogepant', name: 'Atogepant', brand: 'QULIPTA', company: 'AbbVie', moa: 'CGRP receptor antagonist (gepant)', grp: 'CGRP', route: 'Oral', inds: ['MIG'], sponsor: 'abbvie|allergan' },
        { id: 'foscarbidopa', name: 'Foscarbidopa / foslevodopa', short: 'Foscarbidopa', brand: 'VYALEV', company: 'AbbVie', moa: 'Levodopa/carbidopa prodrugs, continuous subcutaneous infusion', grp: 'Dopaminergic', route: 'Injectable', codes: ['ABBV-951'], inds: ['PD'], epmc: '(foslevodopa OR foscarbidopa OR "ABBV-951")', intr: 'foslevodopa OR ABBV-951', sponsor: 'abbvie' },
        { id: 'tavapadon', name: 'Tavapadon', company: 'AbbVie', moa: 'D1/D5 dopamine receptor partial agonist', grp: 'Dopaminergic', route: 'Oral', codes: ['CVL-751'], inds: ['PD'], sponsor: 'cerevel|abbvie' },
        { id: 'cenobamate', name: 'Cenobamate', brand: 'XCOPRI', company: 'SK Life Science', moa: 'Persistent sodium current inhibitor / GABA-A modulator', grp: 'Antiseizure', route: 'Oral', codes: ['YKP3089'], inds: ['EPI'], sponsor: 'sk life' },
        { id: 'fenfluramine', name: 'Fenfluramine', brand: 'FINTEPLA', company: 'UCB', moa: 'Serotonin releaser / sigma-1 modulator', grp: 'Antiseizure', route: 'Oral', codes: ['ZX008'], inds: ['EPI'], sponsor: 'zogenix|ucb' },
        { id: 'azetukalner', name: 'Azetukalner (XEN1101)', short: 'Azetukalner', company: 'Xenon', moa: 'Kv7.2/7.3 potassium channel opener', grp: 'Antiseizure', route: 'Oral', codes: ['XEN1101'], inds: ['EPI'], sponsor: 'xenon' },
        { id: 'efgartigimod', name: 'Efgartigimod alfa', short: 'Efgartigimod', brand: 'VYVGART', company: 'argenx', moa: 'FcRn blocker (IgG1 Fc fragment)', grp: 'FcRn', route: 'Intravenous', codes: ['ARGX-113'], inds: ['GMG', 'CIDP'], sponsor: 'argenx' },
        { id: 'rozanolixizumab', name: 'Rozanolixizumab', brand: 'RYSTIGGO', company: 'UCB', moa: 'Anti-FcRn antibody', grp: 'FcRn', route: 'Injectable', codes: ['UCB7665'], inds: ['GMG'], sponsor: 'ucb' },
        { id: 'nipocalimab', name: 'Nipocalimab', brand: 'IMAAVY', company: 'Johnson & Johnson', moa: 'Anti-FcRn antibody', grp: 'FcRn', route: 'Intravenous', codes: ['M281'], inds: ['GMG'], sponsor: 'janssen|johnson|momenta' },
        { id: 'ravulizumab', name: 'Ravulizumab', brand: 'ULTOMIRIS', company: 'Alexion / AstraZeneca', moa: 'Long-acting C5 inhibitor antibody', grp: 'Complement', route: 'Intravenous', codes: ['ALXN1210'], inds: ['GMG'], sponsor: 'alexion|astrazeneca' },
        { id: 'zilucoplan', name: 'Zilucoplan', brand: 'ZILBRYSQ', company: 'UCB', moa: 'C5 inhibitor macrocyclic peptide', grp: 'Complement', route: 'Injectable', codes: ['RA101495'], inds: ['GMG'], sponsor: 'ucb|ra pharma' },
        { id: 'riliprubart', name: 'Riliprubart', company: 'Sanofi', moa: 'Anti-C1s (activated) antibody', grp: 'Complement', route: 'Injectable', codes: ['SAR445088'], inds: ['CIDP'], sponsor: 'sanofi|genzyme' },
        { id: 'nusinersen', name: 'Nusinersen', brand: 'SPINRAZA', company: 'Biogen / Ionis', moa: 'SMN2 splice-modifying antisense oligonucleotide', grp: 'SMN-targeted', route: 'Intrathecal', inds: ['SMA'], sponsor: 'biogen|ionis' },
        { id: 'risdiplam', name: 'Risdiplam', brand: 'EVRYSDI', company: 'Roche / PTC', moa: 'SMN2 splicing modifier (small molecule)', grp: 'SMN-targeted', route: 'Oral', codes: ['RG7916'], inds: ['SMA'], sponsor: 'hoffmann|genentech|roche|ptc' },
        { id: 'onasemnogene', name: 'Onasemnogene abeparvovec', short: 'Onasemnogene', brand: 'ZOLGENSMA', company: 'Novartis', moa: 'AAV9 SMN1 gene replacement', grp: 'SMN-targeted', route: 'Intravenous', codes: ['AVXS-101', 'OAV101'], inds: ['SMA'], sponsor: 'novartis|avexis' },
        { id: 'tofersen', name: 'Tofersen', brand: 'QALSODY', company: 'Biogen / Ionis', moa: 'SOD1-lowering antisense oligonucleotide', grp: 'Antisense', route: 'Intrathecal', codes: ['BIIB067'], inds: ['ALS'], sponsor: 'biogen|ionis' }
      ],
      guides: [
        ['American Academy of Neurology', '("American Academy of Neurology" OR AAN)', 'https://www.aan.com/practice/guidelines', ['US']],
        ['American Headache Society', '"American Headache Society"', 'https://americanheadachesociety.org/', ['US']],
        ['Alzheimer\'s Association', '"Alzheimer\'s Association"', 'https://www.alz.org/', ['US']],
        ['European Academy of Neurology', '("European Academy of Neurology" OR EAN)', 'https://www.ean.org/', ['EU']],
        ['ECTRIMS', '(ECTRIMS OR "European Committee for Treatment and Research in Multiple Sclerosis")', 'https://ectrims.eu/', ['EU']],
        ['International League Against Epilepsy', '(ILAE OR "International League Against Epilepsy")', 'https://www.ilae.org/', ['*']],
        ['International Parkinson and Movement Disorder Society', '("International Parkinson and Movement Disorder Society" OR "Movement Disorder Society")', 'https://www.movementdisorders.org/', ['*']],
        ['Association of British Neurologists', '"Association of British Neurologists"', 'https://www.theabn.org/', ['GB']],
        ['Deutsche Gesellschaft für Neurologie', '("Deutsche Gesellschaft für Neurologie" OR DGN)', 'https://dgn.org/', ['DE']],
        ['Japanese Society of Neurology', '"Japanese Society of Neurology"', 'https://www.neurology-jp.org/', ['JP']]
      ],
      congresses: [
        ['AAN', 'American Academy of Neurology Annual Meeting', 'https://www.aan.com/events/annual-meeting'],
        ['EAN', 'European Academy of Neurology Congress', 'https://www.ean.org/'],
        ['AAIC', 'Alzheimer\'s Association International Conference', 'https://aaic.alz.org/'],
        ['CTAD', 'Clinical Trials on Alzheimer\'s Disease', 'https://www.ctad-alzheimer.com/'],
        ['AD/PD', 'International Conference on Alzheimer\'s and Parkinson\'s Diseases', 'https://adpd.kenes.com/'],
        ['ECTRIMS', 'European Committee for Treatment and Research in Multiple Sclerosis', 'https://ectrims.eu/'],
        ['ACTRIMS', 'Americas Committee for Treatment and Research in Multiple Sclerosis Forum', 'https://actrims.org/'],
        ['CMSC', 'Consortium of Multiple Sclerosis Centers Annual Meeting', 'https://www.mscare.org/'],
        ['AHS', 'American Headache Society Annual Scientific Meeting', 'https://americanheadachesociety.org/'],
        ['AES', 'American Epilepsy Society Annual Meeting', 'https://aesnet.org/'],
        ['MDS Congress', 'International Congress of Parkinson\'s Disease and Movement Disorders', 'https://www.mdscongress.org/'],
        ['MDA', 'MDA Clinical & Scientific Conference', 'https://www.mdaconference.org/']
      ],
      advocacy: [
        ['Alzheimer\'s Association', 'Patient advocacy', ['ALZ'], 'https://www.alz.org'],
        ['National Multiple Sclerosis Society', 'Patient advocacy', ['MS'], 'https://www.nationalmssociety.org'],
        ['Parkinson\'s Foundation', 'Patient advocacy', ['PD'], 'https://www.parkinson.org'],
        ['Michael J. Fox Foundation', 'Patient advocacy', ['PD'], 'https://www.michaeljfox.org'],
        ['American Migraine Foundation', 'Patient advocacy', ['MIG'], 'https://americanmigrainefoundation.org'],
        ['Epilepsy Foundation', 'Patient advocacy', ['EPI'], 'https://www.epilepsy.com'],
        ['ALS Association', 'Patient advocacy', ['ALS'], 'https://www.als.org'],
        ['Myasthenia Gravis Foundation of America', 'Patient advocacy', ['GMG'], 'https://myasthenia.org'],
        ['Cure SMA', 'Patient advocacy', ['SMA'], 'https://www.curesma.org'],
        ['GBS|CIDP Foundation International', 'Patient advocacy', ['CIDP'], 'https://www.gbs-cidp.org']
      ],
      themes: [
        ['Blood-based biomarkers', '("blood biomarker*" OR "plasma p-tau" OR "p-tau217" OR "plasma biomarker*" OR "neurofilament light")'],
        ['ARIA and anti-amyloid safety', '(ARIA OR "amyloid-related imaging abnormalities")'],
        ['Smoldering MS and progression', '("progression independent of relapse" OR PIRA OR smoldering OR "chronic active lesion*" OR "paramagnetic rim")'],
        ['BTK inhibition in the CNS', '(("BTK inhibitor*" OR "Bruton tyrosine kinase") AND ("multiple sclerosis" OR microglia OR CNS))'],
        ['CGRP pathway and gepants', '(CGRP OR gepant* OR "calcitonin gene-related peptide")'],
        ['FcRn and complement in autoimmune neurology', '((FcRn OR "neonatal Fc receptor" OR complement) AND (myasthenia OR CIDP))'],
        ['Alpha-synuclein and disease modification', '("alpha-synuclein" OR "seed amplification" OR "disease-modifying" OR "disease modification")'],
        ['Antisense and gene therapies', '(antisense OR "gene therapy" OR "adeno-associated virus")'],
        ['Drug-resistant and developmental epilepsies', '("drug-resistant epilepsy" OR "refractory epilepsy" OR "developmental and epileptic encephalopath*")'],
        ['Digital and remote monitoring', '("digital biomarker*" OR wearable* OR "remote monitoring" OR smartphone)']
      ],
      pros: ['MG-ADL', 'MG-QOL15r', 'MIDAS', 'HIT-6', 'MSIS-29', 'MFIS', 'PDQ-39', 'QOLIE-31', 'Neuro-QoL', 'EQ-5D'],
      endpoints: [[/CDR-SB|clinical dementia rating/i, 'CDR-SB'], [/iADRS|ADAS-Cog|ADCS-ADL/i, 'ADAS-Cog / iADRS'], [/EDSS|confirmed disability/i, 'Disability progression (EDSS)'], [/annuali[sz]ed relapse|relapse rate/i, 'Annualized relapse rate'], [/migraine days|\bMMD\b/i, 'Monthly migraine days'], [/pain[- ]free|most bothersome symptom/i, 'Pain freedom / MBS'], [/UPDRS/i, 'MDS-UPDRS'], [/\bOFF[- ]time|good ON[- ]time/i, 'OFF / ON time'], [/seizure/i, 'Seizure frequency'], [/MG-ADL|\bQMG\b/i, 'MG-ADL / QMG'], [/ALSFRS/i, 'ALSFRS-R'], [/HFMSE|RULM|CHOP[- ]INTEND|motor milestone/i, 'SMA motor scales']],
      elig: [[/MMSE|MoCA/i, 'Cognitive screening score'], [/amyloid|p-tau|tau PET/i, 'Amyloid or tau confirmation'], [/EDSS/i, 'EDSS range'], [/relapse/i, 'Recent relapse activity'], [/migraine days|headache days/i, 'Migraine or headache day count'], [/AChR|MuSK|acetylcholine receptor/i, 'MG antibody status'], [/Hoehn|Yahr/i, 'Hoehn and Yahr stage'], [/anti-?seizure|anti-?epileptic/i, 'Background antiseizure medication']],
      gaps: [
        ['apoe', 'APOE ε4 carriers', '(APOE4 OR "APOE ε4" OR "APOE e4" OR "apolipoprotein E4" OR homozygote*)'],
        ['prog', 'Progressive MS', '("progressive multiple sclerosis" OR "primary progressive" OR "secondary progressive" OR PPMS OR SPMS)'],
        ['seroneg', 'Seronegative MG', '(seronegative OR "antibody-negative" OR MuSK OR LRP4)']
      ],
      pops: [['gen', 'Genetically defined subgroups', '(APOE4 OR "APOE ε4" OR SOD1 OR LRRK2 OR GBA1 OR SCN1A)', 'apoe4[tiab] OR sod1[tiab] OR lrrk2[tiab] OR gba1[tiab] OR scn1a[tiab]']]
    },
    {
      id: 'PSY', name: 'Psychiatry', short: 'Psychiatry',
      desc: 'Mood, psychotic, neurodevelopmental, anxiety and sleep disorders',
      fedTerms: ['psychiatric', 'mental health'],
      specialties: 'psychiatr|psycholog|addiction',
      inds: [
        { id: 'MDD', name: 'Major depressive disorder', short: 'major depressive disorder', abbr: ['mdd'], syn: ['major depression', 'depression'], epmc: '("major depressive disorder" OR "major depression")', ct: 'major depressive disorder', re: /major depress|\bMDD\b|depressive disorder/i, not: /bipolar|post-?partum|perinatal/i, label: /major depressive disorder/i, core: true },
        { id: 'SCZ', name: 'Schizophrenia', short: 'schizophrenia', abbr: ['scz'], syn: ['schizoaffective disorder'], epmc: '(schizophrenia)', ct: 'schizophrenia', re: /schizophren|schizoaffective/i, label: /schizophrenia/i, core: true },
        { id: 'BIP', name: 'Bipolar disorder', short: 'bipolar disorder', abbr: ['bd'], syn: ['bipolar depression', 'bipolar mania', 'manic depression'], epmc: '("bipolar disorder" OR "bipolar depression" OR "bipolar I")', ct: 'bipolar disorder', re: /bipolar/i, label: /bipolar/i, core: true },
        { id: 'TRD', name: 'Treatment-resistant depression', short: 'treatment-resistant depression', abbr: ['trd'], syn: ['difficult-to-treat depression'], epmc: '("treatment-resistant depression" OR "treatment resistant depression")', ct: 'treatment resistant depression', re: /treatment[- ]resistant depress|\bTRD\b/i, label: /treatment[- ]resistant depression/i },
        { id: 'ADHD', name: 'Attention-deficit/hyperactivity disorder', short: 'ADHD', abbr: ['adhd', 'add'], syn: ['attention deficit hyperactivity disorder'], epmc: '("attention deficit hyperactivity disorder" OR "attention-deficit/hyperactivity disorder" OR ADHD)', ct: 'attention deficit hyperactivity disorder', re: /attention[- ]deficit|\bADHD\b/i, label: /attention[- ]deficit|\bADHD\b/i },
        { id: 'PPD', name: 'Postpartum depression', short: 'postpartum depression', abbr: ['ppd'], syn: ['postnatal depression', 'perinatal depression'], epmc: '("postpartum depression" OR "postnatal depression" OR "perinatal depression")', ct: 'postpartum depression', re: /post-?partum depress|postnatal depress|perinatal depress/i, label: /postpartum depression/i },
        { id: 'GAD', name: 'Generalized anxiety disorder', short: 'generalized anxiety disorder', abbr: ['gad'], syn: ['generalised anxiety disorder'], epmc: '("generalized anxiety disorder" OR "generalised anxiety disorder")', ct: 'generalized anxiety disorder', re: /generali[sz]ed anxiety/i, label: /generali[sz]ed anxiety disorder/i },
        { id: 'INS', name: 'Insomnia', short: 'insomnia', abbr: [], syn: ['insomnia disorder'], epmc: '(insomnia)', ct: 'insomnia', re: /insomnia/i, label: /insomnia/i },
        { id: 'AGIT', name: 'Agitation in Alzheimer\'s dementia', short: 'agitation in Alzheimer\'s dementia', abbr: [], syn: ['alzheimer agitation', 'agitation associated with dementia'], epmc: '(agitation AND (alzheimer OR dementia))', ct: 'agitation Alzheimer', re: /(alzheimer|dementia).{0,60}agitation|agitation.{0,60}(alzheimer|dementia)/i, label: /agitation associated with dementia/i }
      ],
      assets: [
        { id: 'xanomeline', name: 'Xanomeline / trospium (KarXT)', short: 'Xanomeline', brand: 'COBENFY', company: 'BMS', moa: 'M1/M4 muscarinic agonist with peripheral antagonist', grp: 'Muscarinic', route: 'Oral', codes: ['KarXT'], inds: ['SCZ'], epmc: '(xanomeline OR KarXT)', intr: 'xanomeline OR KarXT', sponsor: 'karuna|bristol' },
        { id: 'nbi1117568', name: 'NBI-1117568', company: 'Neurocrine', moa: 'Selective M4 muscarinic agonist', grp: 'Muscarinic', route: 'Oral', codes: ['NBI-1117568'], inds: ['SCZ'], sponsor: 'neurocrine' },
        { id: 'lumateperone', name: 'Lumateperone', brand: 'CAPLYTA', company: 'Johnson & Johnson (Intra-Cellular)', moa: 'Serotonin/dopamine/glutamate modulator', grp: 'Atypical antipsychotic', route: 'Oral', codes: ['ITI-007'], inds: ['SCZ', 'BIP', 'MDD'], sponsor: 'intra-cellular|janssen|johnson' },
        { id: 'cariprazine', name: 'Cariprazine', brand: 'VRAYLAR', company: 'AbbVie / Gedeon Richter', moa: 'D3-preferring D3/D2 partial agonist', grp: 'Atypical antipsychotic', route: 'Oral', codes: ['RGH-188'], inds: ['SCZ', 'BIP', 'MDD'], sponsor: 'abbvie|allergan|forest|richter' },
        { id: 'brexpiprazole', name: 'Brexpiprazole', brand: 'REXULTI', company: 'Otsuka / Lundbeck', moa: 'Serotonin-dopamine activity modulator', grp: 'Atypical antipsychotic', route: 'Oral', codes: ['OPC-34712'], inds: ['SCZ', 'MDD', 'AGIT'], sponsor: 'otsuka|lundbeck' },
        { id: 'esketamine', name: 'Esketamine', brand: 'SPRAVATO', company: 'Johnson & Johnson', moa: 'NMDA receptor antagonist', grp: 'Glutamatergic', route: 'Intranasal', inds: ['TRD', 'MDD'], sponsor: 'janssen|johnson' },
        { id: 'axs05', name: 'Dextromethorphan / bupropion (AXS-05)', short: 'AXS-05', brand: 'AUVELITY', company: 'Axsome', moa: 'NMDA antagonist / sigma-1 agonist with CYP2D6 inhibition', grp: 'Glutamatergic', route: 'Oral', codes: ['AXS-05'], inds: ['MDD', 'AGIT'], epmc: '("AXS-05" OR (dextromethorphan AND bupropion))', intr: 'AXS-05 OR (dextromethorphan AND bupropion)', sponsor: 'axsome' },
        { id: 'zuranolone', name: 'Zuranolone', brand: 'ZURZUVAE', company: 'Supernus (Sage) / Biogen', moa: 'Neuroactive steroid GABA-A positive allosteric modulator', grp: 'Neuroactive steroid', route: 'Oral', codes: ['SAGE-217'], inds: ['PPD', 'MDD'], sponsor: 'sage|biogen|supernus' },
        { id: 'seltorexant', name: 'Seltorexant', company: 'Johnson & Johnson', moa: 'Selective orexin-2 receptor antagonist', grp: 'Orexin', route: 'Oral', codes: ['JNJ-42847922'], inds: ['MDD'], sponsor: 'janssen|johnson' },
        { id: 'daridorexant', name: 'Daridorexant', brand: 'QUVIVIQ', company: 'Idorsia', moa: 'Dual orexin receptor antagonist', grp: 'Orexin', route: 'Oral', codes: ['ACT-541468'], inds: ['INS'], sponsor: 'idorsia' },
        { id: 'lemborexant', name: 'Lemborexant', brand: 'DAYVIGO', company: 'Eisai', moa: 'Dual orexin receptor antagonist', grp: 'Orexin', route: 'Oral', codes: ['E2006'], inds: ['INS'], sponsor: 'eisai' },
        { id: 'suvorexant', name: 'Suvorexant', brand: 'BELSOMRA', company: 'Merck', moa: 'Dual orexin receptor antagonist', grp: 'Orexin', route: 'Oral', codes: ['MK-4305'], inds: ['INS'], sponsor: 'merck sharp' },
        { id: 'comp360', name: 'Psilocybin (COMP360)', short: 'COMP360', company: 'Compass Pathways', moa: '5-HT2A agonist psychedelic', grp: 'Psychedelic', route: 'Oral', codes: ['COMP360'], inds: ['TRD'], sponsor: 'compass' },
        { id: 'mm120', name: 'Lysergide (MM120)', short: 'MM120', company: 'MindMed', moa: '5-HT2A agonist psychedelic', grp: 'Psychedelic', route: 'Oral', codes: ['MM120', 'MM-120'], inds: ['GAD', 'MDD'], sponsor: 'mind medicine|mindmed' },
        { id: 'vortioxetine', name: 'Vortioxetine', brand: 'TRINTELLIX', company: 'Takeda / Lundbeck', moa: 'Serotonin reuptake inhibitor and receptor modulator', grp: 'Serotonergic', route: 'Oral', codes: ['Lu AA21004'], inds: ['MDD'], sponsor: 'takeda|lundbeck' },
        { id: 'lisdexamfetamine', name: 'Lisdexamfetamine', brand: 'VYVANSE', company: 'Takeda', moa: 'Amphetamine prodrug stimulant', grp: 'Catecholaminergic', route: 'Oral', inds: ['ADHD'], sponsor: 'shire|takeda' },
        { id: 'viloxazine', name: 'Viloxazine', brand: 'QELBREE', company: 'Supernus', moa: 'Norepinephrine reuptake inhibitor (non-stimulant)', grp: 'Catecholaminergic', route: 'Oral', codes: ['SPN-812'], inds: ['ADHD'], sponsor: 'supernus' },
        { id: 'centanafadine', name: 'Centanafadine', company: 'Otsuka', moa: 'Norepinephrine-dopamine-serotonin reuptake inhibitor', grp: 'Catecholaminergic', route: 'Oral', inds: ['ADHD'], sponsor: 'otsuka' },
        { id: 'solriamfetol', name: 'Solriamfetol', brand: 'SUNOSI', company: 'Axsome', moa: 'Dopamine/norepinephrine reuptake inhibitor, TAAR1 agonist', grp: 'Catecholaminergic', route: 'Oral', inds: ['ADHD'], sponsor: 'axsome|jazz' }
      ],
      guides: [
        ['American Psychiatric Association', '("American Psychiatric Association" OR APA)', 'https://www.psychiatry.org/psychiatrists/practice/clinical-practice-guidelines', ['US']],
        ['American Academy of Child and Adolescent Psychiatry', '("American Academy of Child and Adolescent Psychiatry" OR AACAP)', 'https://www.aacap.org/', ['US']],
        ['American Academy of Sleep Medicine', '("American Academy of Sleep Medicine" OR AASM)', 'https://aasm.org/', ['US']],
        ['CANMAT', '(CANMAT OR "Canadian Network for Mood and Anxiety Treatments")', 'https://www.canmat.org/', ['CA']],
        ['British Association for Psychopharmacology', '"British Association for Psychopharmacology"', 'https://www.bap.org.uk/', ['GB']],
        ['European Psychiatric Association', '"European Psychiatric Association"', 'https://www.europsy.net/', ['EU']],
        ['WFSBP', '(WFSBP OR "World Federation of Societies of Biological Psychiatry")', 'https://www.wfsbp.org/', ['*']],
        ['DGPPN', '(DGPPN OR "Deutsche Gesellschaft für Psychiatrie")', 'https://www.dgppn.de/', ['DE']],
        ['Japanese Society of Psychiatry and Neurology', '"Japanese Society of Psychiatry and Neurology"', 'https://www.jspn.or.jp/', ['JP']],
        ['RANZCP', '(RANZCP OR "Royal Australian and New Zealand College of Psychiatrists")', 'https://www.ranzcp.org/', ['AU']]
      ],
      congresses: [
        ['APA', 'American Psychiatric Association Annual Meeting', 'https://www.psychiatry.org/'],
        ['ECNP', 'European College of Neuropsychopharmacology Congress', 'https://www.ecnp.eu/'],
        ['ASCP', 'American Society of Clinical Psychopharmacology Annual Meeting', 'https://ascpp.org/'],
        ['ACNP', 'American College of Neuropsychopharmacology Annual Meeting', 'https://acnp.org/'],
        ['Psych Congress', 'Psych Congress', 'https://www.psychcongress.com/'],
        ['EPA', 'European Congress of Psychiatry', 'https://www.europsy.net/'],
        ['CINP', 'CINP World Congress of Neuropsychopharmacology', 'https://www.cinp.org/'],
        ['SIRS', 'Schizophrenia International Research Society Congress', 'https://schizophreniaresearchsociety.org/'],
        ['ISBD', 'International Society for Bipolar Disorders Conference', 'https://www.isbd.org/'],
        ['ADAA', 'Anxiety and Depression Association of America Conference', 'https://adaa.org/'],
        ['AACAP', 'AACAP Annual Meeting', 'https://www.aacap.org/'],
        ['SLEEP', 'SLEEP Annual Meeting (APSS)', 'https://www.sleepmeeting.org/']
      ],
      advocacy: [
        ['NAMI', 'Patient advocacy', ['*'], 'https://www.nami.org'],
        ['Mental Health America', 'Patient advocacy', ['*'], 'https://mhanational.org'],
        ['Depression and Bipolar Support Alliance', 'Patient advocacy', ['MDD', 'TRD', 'BIP'], 'https://www.dbsalliance.org'],
        ['Schizophrenia & Psychosis Action Alliance', 'Patient advocacy', ['SCZ'], 'https://sczaction.org'],
        ['CHADD', 'Patient advocacy', ['ADHD'], 'https://chadd.org'],
        ['Postpartum Support International', 'Patient advocacy', ['PPD'], 'https://www.postpartum.net'],
        ['Anxiety and Depression Association of America', 'Patient advocacy', ['GAD', 'MDD'], 'https://adaa.org'],
        ['Alzheimer\'s Association', 'Patient advocacy', ['AGIT'], 'https://www.alz.org'],
        ['Brain & Behavior Research Foundation', 'Patient advocacy', ['*'], 'https://bbrfoundation.org'],
        ['American Academy of Sleep Medicine', 'Professional society', ['INS'], 'https://aasm.org']
      ],
      themes: [
        ['Muscarinic antipsychotics', '(muscarinic OR xanomeline OR KarXT OR "M4 agonist")'],
        ['Rapid-acting antidepressants', '("rapid-acting antidepressant*" OR esketamine OR ketamine OR "NMDA receptor")'],
        ['Psychedelic-assisted therapy', '(psilocybin OR lysergide OR LSD OR MDMA OR psychedelic*)'],
        ['Neuroactive steroids', '("neuroactive steroid*" OR zuranolone OR brexanolone OR "GABA-A receptor positive allosteric")'],
        ['Negative symptoms and cognition', '("negative symptoms" OR "cognitive impairment associated with schizophrenia" OR CIAS)'],
        ['Long-acting injectables', '("long-acting injectable*" OR "depot antipsychotic*")'],
        ['Suicidality and suicide prevention', '(suicid*)'],
        ['Metabolic burden of antipsychotics', '("antipsychotic-induced weight gain" OR "metabolic syndrome" OR "metabolic adverse")'],
        ['Orexin and sleep in depression', '(orexin OR "insomnia symptoms")'],
        ['Digital therapeutics', '("digital therapeutic*" OR "prescription digital" OR "app-based" OR smartphone)']
      ],
      pros: ['PHQ-9', 'QIDS-SR', 'GAD-7', 'ISI', 'SDS', 'Q-LES-Q-SF', 'PSQI', 'ASRS', 'EPDS', 'IDSIQ'],
      endpoints: [[/MADRS|Montgomery/i, 'MADRS'], [/HAM-?D|HDRS|Hamilton (rating scale for )?depression/i, 'HAM-D'], [/HAM-?A\b|Hamilton (rating scale for )?anxiety/i, 'HAM-A'], [/PANSS/i, 'PANSS'], [/YMRS|Young Mania/i, 'YMRS'], [/ADHD-RS|ADHD rating scale|AISRS/i, 'ADHD-RS'], [/CMAI|Cohen-Mansfield/i, 'CMAI (agitation)'], [/WASO|wake after sleep onset|latency to persistent sleep|\bLPS\b/i, 'Sleep onset / maintenance'], [/CGI|clinical global impression/i, 'CGI'], [/relapse/i, 'Relapse prevention']],
      elig: [[/MADRS|HAM-?D/i, 'Depression severity threshold'], [/PANSS/i, 'PANSS threshold'], [/inadequate response|treatment[- ]resistant|antidepressant failure/i, 'Prior treatment failure'], [/suicid/i, 'Suicidality exclusion'], [/substance use|alcohol use|drug abuse/i, 'Substance use exclusion'], [/DSM|MINI International/i, 'DSM diagnosis'], [/washout/i, 'Medication washout']],
      gaps: [
        ['func', 'Functional recovery', '("functional recovery" OR functioning OR remission)'],
        ['trs', 'Treatment-resistant schizophrenia', '("treatment-resistant schizophrenia" OR clozapine)'],
        ['suic', 'Suicidality', '(suicid*)']
      ],
      pops: [['perinatal', 'Postpartum and perinatal', '(postpartum OR perinatal OR lactation OR breastfeeding)', 'postpartum[tiab] OR perinatal[tiab] OR lactation[tiab]']]
    },
    {
      id: 'OPH', name: 'Ophthalmology', short: 'Ophthalmology',
      desc: 'Retinal, glaucoma, ocular surface and orbital eye disease',
      fedTerms: ['ophthalmic'],
      specialties: 'ophthalmolog|retina|optometr',
      inds: [
        { id: 'NAMD', name: 'Neovascular age-related macular degeneration', short: 'neovascular AMD', abbr: ['namd', 'wamd', 'amd'], syn: ['wet amd', 'wet age-related macular degeneration', 'exudative amd'], epmc: '("neovascular age-related macular degeneration" OR "wet age-related macular degeneration" OR "neovascular AMD" OR nAMD)', ct: 'wet age-related macular degeneration', re: /neovascular age|wet (age|macular)|wet AMD|\bnAMD\b|exudative age|choroidal neovasc/i, label: /neovascular.{0,10}age-related macular|wet age-related/i, core: true },
        { id: 'DME', name: 'Diabetic macular edema', short: 'diabetic macular edema', abbr: ['dme', 'dmo'], syn: ['diabetic macular oedema'], epmc: '("diabetic macular edema" OR "diabetic macular oedema")', ct: 'diabetic macular edema', re: /diabetic macular (edema|oedema)|\bDME\b|\bDMO\b/i, label: /diabetic macular edema/i, core: true },
        { id: 'GA', name: 'Geographic atrophy', short: 'geographic atrophy', abbr: ['ga'], syn: ['dry amd', 'atrophic amd'], epmc: '("geographic atrophy")', ct: 'geographic atrophy', re: /geographic atrophy/i, label: /geographic atrophy/i, core: true },
        { id: 'RVO', name: 'Macular edema after retinal vein occlusion', short: 'retinal vein occlusion', abbr: ['rvo', 'brvo', 'crvo'], syn: ['retinal vein occlusion'], epmc: '("retinal vein occlusion")', ct: 'retinal vein occlusion', re: /retinal vein occlusion|\bB?RVO\b|\bCRVO\b/i, label: /retinal vein occlusion/i },
        { id: 'GLA', name: 'Glaucoma and ocular hypertension', short: 'glaucoma', abbr: ['poag', 'oht'], syn: ['open-angle glaucoma', 'ocular hypertension'], epmc: '(glaucoma OR "ocular hypertension")', ct: 'glaucoma', re: /glaucoma|ocular hypertension/i, label: /glaucoma|ocular hypertension/i },
        { id: 'DED', name: 'Dry eye disease', short: 'dry eye disease', abbr: ['ded'], syn: ['dry eye', 'keratoconjunctivitis sicca'], epmc: '("dry eye" OR "keratoconjunctivitis sicca")', ct: 'dry eye disease', re: /dry eye|keratoconjunctivitis sicca/i, label: /dry eye|keratoconjunctivitis sicca/i },
        { id: 'TED', name: 'Thyroid eye disease', short: 'thyroid eye disease', abbr: ['ted'], syn: ['graves orbitopathy', 'graves ophthalmopathy'], epmc: '("thyroid eye disease" OR "Graves orbitopathy" OR "Graves ophthalmopathy" OR "thyroid-associated orbitopathy")', ct: 'thyroid eye disease', re: /thyroid eye|orbitopathy|graves'? ophthalmopathy/i, label: /thyroid eye disease/i },
        { id: 'PRES', name: 'Presbyopia', short: 'presbyopia', abbr: [], syn: [], epmc: '(presbyopia)', ct: 'presbyopia', re: /presbyopi/i, label: /presbyopia/i }
      ],
      assets: [
        { id: 'aflibercept', name: 'Aflibercept', brand: 'EYLEA', company: 'Regeneron / Bayer', moa: 'VEGF trap (VEGF-A, PlGF)', grp: 'Anti-VEGF', route: 'Intravitreal', inds: ['NAMD', 'DME', 'RVO'], epmc: '(aflibercept AND (intravitreal OR macular OR retina*))', intr: 'aflibercept', sponsor: 'regeneron|bayer', labelRoute: 'INTRAVITREAL', sibling: 'ZALTRAP' },
        { id: 'faricimab', name: 'Faricimab', brand: 'VABYSMO', company: 'Roche / Genentech', moa: 'Bispecific anti-VEGF-A / Ang-2', grp: 'Anti-VEGF', route: 'Intravitreal', codes: ['RG7716'], inds: ['NAMD', 'DME', 'RVO'], sponsor: 'hoffmann|genentech|roche' },
        { id: 'ranibizumab', name: 'Ranibizumab', brand: 'LUCENTIS', company: 'Genentech / Novartis', moa: 'Anti-VEGF-A antibody fragment', grp: 'Anti-VEGF', route: 'Intravitreal', inds: ['NAMD', 'DME', 'RVO'], sponsor: 'genentech|novartis|roche' },
        { id: 'brolucizumab', name: 'Brolucizumab', brand: 'BEOVU', company: 'Novartis', moa: 'Anti-VEGF-A single-chain antibody fragment', grp: 'Anti-VEGF', route: 'Intravitreal', codes: ['RTH258'], inds: ['NAMD', 'DME'], sponsor: 'novartis' },
        { id: 'tarcocimab', name: 'Tarcocimab tedromer', short: 'Tarcocimab', company: 'Kodiak Sciences', moa: 'Anti-VEGF antibody biopolymer conjugate', grp: 'Anti-VEGF', route: 'Intravitreal', codes: ['KSI-301'], inds: ['NAMD'], sponsor: 'kodiak' },
        { id: 'eyp1901', name: 'Vorolanib insert (EYP-1901)', short: 'EYP-1901', company: 'EyePoint', moa: 'VEGFR tyrosine kinase inhibitor, bioerodible insert', grp: 'TKI sustained delivery', route: 'Intravitreal', codes: ['EYP-1901'], inds: ['NAMD'], sponsor: 'eyepoint' },
        { id: 'otxtki', name: 'Axitinib implant (OTX-TKI)', short: 'OTX-TKI', company: 'Ocular Therapeutix', moa: 'VEGFR tyrosine kinase inhibitor, hydrogel implant', grp: 'TKI sustained delivery', route: 'Intravitreal', codes: ['OTX-TKI'], inds: ['NAMD'], epmc: '("OTX-TKI" OR AXPAXLI OR (axitinib AND intravitreal))', intr: 'OTX-TKI', sponsor: 'ocular therapeutix' },
        { id: 'rgx314', name: 'Surabgene lomparvovec (ABBV-RGX-314)', short: 'ABBV-RGX-314', company: 'AbbVie / REGENXBIO', moa: 'AAV8 anti-VEGF gene therapy (subretinal)', grp: 'Gene therapy', route: 'Injectable', codes: ['ABBV-RGX-314', 'RGX-314'], inds: ['NAMD'], sponsor: 'regenxbio|abbvie' },
        { id: '4d150', name: '4D-150', company: '4D Molecular Therapeutics', moa: 'Intravitreal AAV anti-VEGF gene therapy', grp: 'Gene therapy', route: 'Intravitreal', codes: ['4D-150'], inds: ['NAMD'], sponsor: '4d molecular' },
        { id: 'pegcetacoplan', name: 'Pegcetacoplan (intravitreal)', short: 'Pegcetacoplan', brand: 'SYFOVRE', company: 'Apellis', moa: 'C3 inhibitor', grp: 'Complement', route: 'Intravitreal', inds: ['GA'], epmc: '(pegcetacoplan AND ("geographic atrophy" OR intravitreal))', intr: 'pegcetacoplan', sponsor: 'apellis', labelRoute: 'INTRAVITREAL', sibling: 'EMPAVELI' },
        { id: 'avacincaptad', name: 'Avacincaptad pegol', short: 'Avacincaptad', brand: 'IZERVAY', company: 'Astellas', moa: 'C5 inhibitor (aptamer)', grp: 'Complement', route: 'Intravitreal', codes: ['Zimura'], inds: ['GA'], sponsor: 'iveric|astellas|ophthotech' },
        { id: 'anx007', name: 'ANX007', company: 'Annexon', moa: 'Anti-C1q antibody fragment', grp: 'Complement', route: 'Intravitreal', codes: ['ANX007'], inds: ['GA'], sponsor: 'annexon' },
        { id: 'dexamethasoneimplant', name: 'Dexamethasone intravitreal implant', short: 'Ozurdex', brand: 'OZURDEX', generic: 'dexamethasone', company: 'AbbVie', moa: 'Corticosteroid sustained-release implant', grp: 'Corticosteroid', route: 'Intravitreal', inds: ['DME', 'RVO'], epmc: '(Ozurdex OR "dexamethasone intravitreal implant" OR "dexamethasone implant")', intr: 'Ozurdex OR dexamethasone implant', sponsor: 'allergan|abbvie', labelRoute: 'INTRAVITREAL' },
        { id: 'netarsudil', name: 'Netarsudil', brand: 'RHOPRESSA', company: 'Alcon', moa: 'Rho kinase inhibitor', grp: 'IOP-lowering', route: 'Ophthalmic', codes: ['AR-13324'], inds: ['GLA'], sponsor: 'aerie|alcon' },
        { id: 'latanoprostenebunod', name: 'Latanoprostene bunod', brand: 'VYZULTA', company: 'Bausch + Lomb', moa: 'Nitric oxide-donating prostaglandin analog', grp: 'IOP-lowering', route: 'Ophthalmic', inds: ['GLA'], sponsor: 'bausch|nicox' },
        { id: 'omidenepag', name: 'Omidenepag isopropyl', short: 'Omidenepag', brand: 'OMLONTI', company: 'Santen', moa: 'Selective EP2 receptor agonist', grp: 'IOP-lowering', route: 'Ophthalmic', inds: ['GLA'], sponsor: 'santen' },
        { id: 'travoprostimplant', name: 'Travoprost intracameral implant', short: 'iDose TR', brand: 'IDOSE TR', generic: 'travoprost', company: 'Glaukos', moa: 'Prostaglandin analog, sustained-release implant', grp: 'IOP-lowering', route: 'Ophthalmic', inds: ['GLA'], epmc: '(iDose OR "travoprost intracameral" OR "travoprost implant")', intr: 'iDose OR travoprost implant', sponsor: 'glaukos', labelRoute: 'INTRACAMERAL' },
        { id: 'perfluorohexyloctane', name: 'Perfluorohexyloctane', brand: 'MIEBO', company: 'Bausch + Lomb', moa: 'Semifluorinated alkane (evaporation barrier)', grp: 'Dry eye agents', route: 'Ophthalmic', codes: ['NOV03'], inds: ['DED'], sponsor: 'bausch|novaliq' },
        { id: 'lifitegrast', name: 'Lifitegrast', brand: 'XIIDRA', company: 'Bausch + Lomb', moa: 'LFA-1 antagonist', grp: 'Dry eye agents', route: 'Ophthalmic', inds: ['DED'], sponsor: 'shire|takeda|novartis|bausch' },
        { id: 'varenicline', name: 'Varenicline nasal spray', short: 'Varenicline', brand: 'TYRVAYA', company: 'Viatris', moa: 'Nicotinic acetylcholine receptor agonist (tear stimulation)', grp: 'Dry eye agents', route: 'Intranasal', codes: ['OC-01'], inds: ['DED'], epmc: '(varenicline AND (nasal OR "dry eye"))', intr: 'varenicline', sponsor: 'oyster point|viatris', labelRoute: 'NASAL', sibling: 'CHANTIX' },
        { id: 'acoltremon', name: 'Acoltremon', brand: 'TRYPTYR', company: 'Alcon', moa: 'TRPM8 agonist', grp: 'Dry eye agents', route: 'Ophthalmic', codes: ['AR-15512'], inds: ['DED'], sponsor: 'alcon|aerie' },
        { id: 'reproxalap', name: 'Reproxalap', company: 'Aldeyra', moa: 'RASP inhibitor', grp: 'Dry eye agents', route: 'Ophthalmic', inds: ['DED'], sponsor: 'aldeyra' },
        { id: 'teprotumumab', name: 'Teprotumumab', brand: 'TEPEZZA', company: 'Amgen', moa: 'IGF-1R inhibitor antibody', grp: 'IGF-1R', route: 'Intravenous', inds: ['TED'], sponsor: 'horizon|amgen|river vision' },
        { id: 'veligrotug', name: 'Veligrotug (VRDN-001)', short: 'Veligrotug', company: 'Viridian', moa: 'IGF-1R inhibitor antibody', grp: 'IGF-1R', route: 'Intravenous', codes: ['VRDN-001'], inds: ['TED'], sponsor: 'viridian' },
        { id: 'efgartigimod', name: 'Efgartigimod alfa', short: 'Efgartigimod', brand: 'VYVGART', company: 'argenx', moa: 'FcRn blocker (IgG1 Fc fragment)', grp: 'FcRn', route: 'Intravenous', codes: ['ARGX-113'], inds: ['TED'], sponsor: 'argenx' },
        { id: 'pilocarpine', name: 'Pilocarpine ophthalmic', short: 'Pilocarpine', brand: 'VUITY', company: 'AbbVie', moa: 'Muscarinic agonist (miotic)', grp: 'Miotic', route: 'Ophthalmic', inds: ['PRES'], epmc: '(pilocarpine AND presbyopi*)', intr: 'pilocarpine', sponsor: 'allergan|abbvie', labelRoute: 'OPHTHALMIC', sibling: 'SALAGEN' },
        { id: 'aceclidine', name: 'Aceclidine', brand: 'VIZZ', company: 'LENZ Therapeutics', moa: 'Pupil-selective muscarinic agonist (miotic)', grp: 'Miotic', route: 'Ophthalmic', inds: ['PRES'], sponsor: 'lenz' }
      ],
      guides: [
        ['American Academy of Ophthalmology', '("American Academy of Ophthalmology" OR "Preferred Practice Pattern")', 'https://www.aao.org/education/preferred-practice-pattern', ['US']],
        ['American Thyroid Association', '"American Thyroid Association"', 'https://www.thyroid.org/', ['US']],
        ['Canadian Ophthalmological Society', '"Canadian Ophthalmological Society"', 'https://www.cos-sco.ca/', ['CA']],
        ['Royal College of Ophthalmologists', '"Royal College of Ophthalmologists"', 'https://www.rcophth.ac.uk/', ['GB']],
        ['European Glaucoma Society', '"European Glaucoma Society"', 'https://www.eugs.org/', ['EU']],
        ['EURETINA', '(EURETINA OR "European Society of Retina Specialists")', 'https://euretina.org/', ['EU']],
        ['EUGOGO', '(EUGOGO OR "European Group on Graves\' Orbitopathy")', 'https://www.eugogo.eu/', ['EU']],
        ['TFOS (DEWS)', '(TFOS OR "Tear Film and Ocular Surface Society" OR DEWS)', 'https://www.tearfilm.org/', ['*']],
        ['Japanese Ophthalmological Society', '"Japanese Ophthalmological Society"', 'https://www.nichigan.or.jp/', ['JP']],
        ['RANZCO', '(RANZCO OR "Royal Australian and New Zealand College of Ophthalmologists")', 'https://ranzco.edu/', ['AU']]
      ],
      congresses: [
        ['AAO', 'American Academy of Ophthalmology Annual Meeting', 'https://www.aao.org/annual-meeting'],
        ['ARVO', 'Association for Research in Vision and Ophthalmology', 'https://www.arvo.org/'],
        ['ASRS', 'American Society of Retina Specialists Annual Meeting', 'https://www.asrs.org/'],
        ['EURETINA', 'EURETINA Congress', 'https://euretina.org/'],
        ['Retina Society', 'Retina Society Annual Meeting', 'https://www.retinasociety.org/'],
        ['Macula Society', 'Macula Society Annual Meeting', 'https://www.maculasociety.org/'],
        ['AGS', 'American Glaucoma Society Annual Meeting', 'https://www.americanglaucomasociety.net/'],
        ['EGS', 'European Glaucoma Society Congress', 'https://www.eugs.org/'],
        ['ASCRS', 'American Society of Cataract and Refractive Surgery', 'https://ascrs.org/'],
        ['ESCRS', 'European Society of Cataract and Refractive Surgeons', 'https://www.escrs.org/'],
        ['ASOPRS', 'American Society of Ophthalmic Plastic and Reconstructive Surgery', 'https://www.asoprs.org/'],
        ['TFOS', 'Tear Film & Ocular Surface Society Conference', 'https://www.tearfilm.org/']
      ],
      advocacy: [
        ['American Macular Degeneration Foundation', 'Patient advocacy', ['NAMD', 'GA'], 'https://www.macular.org'],
        ['Macular Society', 'Patient advocacy', ['NAMD', 'GA'], 'https://www.macularsociety.org'],
        ['BrightFocus Foundation', 'Patient advocacy', ['NAMD', 'GA', 'GLA'], 'https://www.brightfocus.org'],
        ['Glaucoma Research Foundation', 'Patient advocacy', ['GLA'], 'https://glaucoma.org'],
        ['Graves\' Disease & Thyroid Foundation', 'Patient advocacy', ['TED'], 'https://gdatf.org'],
        ['Prevent Blindness', 'Patient advocacy', ['*'], 'https://preventblindness.org'],
        ['American Academy of Ophthalmology', 'Professional society', ['*'], 'https://www.aao.org']
      ],
      themes: [
        ['Durability and extended dosing', '(durability OR "treat-and-extend" OR "extended dosing" OR "treatment interval" OR "high-dose aflibercept")'],
        ['Sustained-release delivery', '("sustained release" OR "port delivery" OR "intravitreal implant" OR "tyrosine kinase inhibitor")'],
        ['Ocular gene therapy', '("gene therapy" OR AAV OR subretinal OR suprachoroidal)'],
        ['Complement in geographic atrophy', '((complement OR C3 OR C5 OR C1q) AND "geographic atrophy")'],
        ['Anti-VEGF biosimilars', '(biosimilar* AND (aflibercept OR ranibizumab OR "anti-VEGF"))'],
        ['Intraocular inflammation and vasculitis', '("intraocular inflammation" OR "retinal vasculitis" OR "occlusive vasculitis" OR endophthalmitis)'],
        ['Ang-2 and vascular stability', '("angiopoietin-2" OR "Ang-2" OR Tie2)'],
        ['Home monitoring and AI imaging', '("home monitoring" OR "home OCT" OR "artificial intelligence" OR "deep learning")'],
        ['Minimally invasive glaucoma procedures', '(MIGS OR "minimally invasive glaucoma" OR "intracameral implant")'],
        ['IGF-1R therapy and hearing in TED', '(("IGF-1R" OR "insulin-like growth factor" OR hearing) AND ("thyroid eye" OR "Graves orbitopathy"))']
      ],
      pros: ['NEI VFQ-25', 'OSDI', 'SANDE', 'Eye Dryness Score', 'GO-QOL', 'MacTSQ', 'GQL-15', 'FRII'],
      endpoints: [[/proptosis|exophthalmometr/i, 'Proptosis response'], [/lesion growth|GA (lesion|area)|atrophy (area|growth)|fundus autofluorescence/i, 'GA lesion growth'], [/near visual acuity|near vision|DCNVA/i, 'Near visual acuity'], [/BCVA|visual acuity|ETDRS letters/i, 'BCVA'], [/central subfield|retinal thickness|\bCST\b|\bCRT\b/i, 'Central subfield thickness'], [/DRSS|diabetic retinopathy severity/i, 'DRSS'], [/\bIOP\b|intraocular pressure/i, 'IOP'], [/Schirmer/i, 'Schirmer test'], [/corneal.{0,20}staining|\btCFS\b/i, 'Corneal staining'], [/dryness|OSDI|SANDE/i, 'Dryness symptom score']],
      elig: [[/BCVA|visual acuity|ETDRS/i, 'BCVA range'], [/treatment[- ]na[iï]ve|previously untreated|prior anti-VEGF/i, 'Prior anti-VEGF status'], [/central subfield|retinal thickness|\bCST\b/i, 'Central subfield thickness threshold'], [/HbA1c/i, 'HbA1c limit'], [/\bIOP\b|intraocular pressure/i, 'IOP threshold'], [/lesion (size|area)|mm2|mm²/i, 'GA lesion size'], [/clinical activity score|proptosis/i, 'TED activity or proptosis'], [/Schirmer|OSDI|corneal staining/i, 'Dry eye severity']],
      gaps: [
        ['burden', 'Treatment burden and adherence', '("treatment burden" OR adherence OR "loss to follow-up" OR undertreatment)'],
        ['func', 'Visual function beyond acuity', '("low luminance" OR "reading speed" OR microperimetry OR "contrast sensitivity")'],
        ['fellow', 'Fellow-eye and bilateral disease', '("fellow eye" OR bilateral)']
      ],
      pops: [['pcv', 'Polypoidal choroidal vasculopathy', '("polypoidal choroidal vasculopathy" OR PCV)', '"polypoidal choroidal vasculopathy"[tiab]']]
    },
    {
      id: 'RARE', name: 'Rare & genetic diseases', short: 'Rare disease',
      desc: 'Neuromuscular, lysosomal storage, metabolic and skeletal genetic disorders',
      fedTerms: ['rare disease'],
      specialties: 'genetic|metabol|neuro|pediatric',
      inds: [
        { id: 'DMD', name: 'Duchenne muscular dystrophy', short: 'Duchenne muscular dystrophy', abbr: ['dmd'], syn: ['duchenne'], epmc: '("Duchenne muscular dystrophy" OR Duchenne)', ct: 'Duchenne muscular dystrophy', re: /duchenne/i, label: /duchenne/i, core: true },
        { id: 'ATTR', name: 'Hereditary ATTR polyneuropathy', short: 'hATTR polyneuropathy', abbr: ['hattr', 'attrv', 'attr-pn'], syn: ['hereditary transthyretin amyloidosis', 'familial amyloid polyneuropathy', 'transthyretin amyloid polyneuropathy'], epmc: '("hereditary transthyretin" OR "familial amyloid polyneuropathy" OR ATTRv OR hATTR OR ("transthyretin" AND polyneuropathy))', ct: 'hereditary transthyretin amyloidosis', re: /transthyretin|\bh?ATTR|amyloid (poly)?neuropathy/i, not: /cardiomyopath|wild[- ]type/i, label: /polyneuropathy/i, core: true },
        { id: 'FAB', name: 'Fabry disease', short: 'Fabry disease', abbr: [], syn: ['alpha-galactosidase a deficiency'], epmc: '("Fabry disease")', ct: 'Fabry disease', re: /fabry/i, label: /fabry/i, core: true },
        { id: 'POM', name: 'Pompe disease', short: 'Pompe disease', abbr: ['lopd', 'iopd'], syn: ['acid maltase deficiency', 'glycogen storage disease type ii', 'acid alpha-glucosidase deficiency'], epmc: '("Pompe disease" OR "glycogen storage disease type II" OR "acid maltase deficiency")', ct: 'Pompe disease', re: /pompe|acid (alpha-)?glucosidase deficiency|glycogen storage disease type (II|2)\b|acid maltase/i, label: /pompe|acid alpha-glucosidase/i },
        { id: 'GAU', name: 'Gaucher disease', short: 'Gaucher disease', abbr: [], syn: [], epmc: '("Gaucher disease")', ct: 'Gaucher disease', re: /gaucher/i, label: /gaucher/i },
        { id: 'PKU', name: 'Phenylketonuria', short: 'phenylketonuria', abbr: ['pku'], syn: ['hyperphenylalaninemia'], epmc: '(phenylketonuria OR hyperphenylalaninemia)', ct: 'phenylketonuria', re: /phenylketon|\bPKU\b|hyperphenylalanin/i, label: /phenylketonuria|hyperphenylalanin/i },
        { id: 'FA', name: 'Friedreich ataxia', short: 'Friedreich ataxia', abbr: ['frda'], syn: ['friedreich\'s ataxia'], epmc: '("Friedreich ataxia" OR "Friedreich\'s ataxia")', ct: 'Friedreich ataxia', re: /friedreich/i, label: /friedreich/i },
        { id: 'ACH', name: 'Achondroplasia', short: 'achondroplasia', abbr: [], syn: [], epmc: '(achondroplasia)', ct: 'achondroplasia', re: /achondroplas/i, label: /achondroplasia/i },
        { id: 'MPS', name: 'Mucopolysaccharidoses', short: 'mucopolysaccharidosis', abbr: ['mps', 'mps i', 'mps ii'], syn: ['hunter syndrome', 'hurler syndrome', 'sanfilippo syndrome', 'morquio syndrome'], epmc: '(mucopolysaccharidosis OR mucopolysaccharidoses OR "Hunter syndrome" OR "Hurler syndrome" OR "Sanfilippo syndrome")', ct: 'mucopolysaccharidosis', re: /mucopolysacchar|\bMPS ?(I|II|III|IV|VI|VII|1|2|3|4|6|7)\b|hurler|hunter syndrome|sanfilippo|morquio/i, label: /mucopolysaccharidosis|hurler|hunter syndrome/i }
      ],
      assets: [
        { id: 'delandistrogene', name: 'Delandistrogene moxeparvovec', short: 'Delandistrogene', brand: 'ELEVIDYS', company: 'Sarepta / Roche', moa: 'AAVrh74 micro-dystrophin gene therapy', grp: 'Gene therapy', route: 'Intravenous', codes: ['SRP-9001'], inds: ['DMD'], sponsor: 'sarepta|hoffmann|roche' },
        { id: 'eteplirsen', name: 'Eteplirsen', brand: 'EXONDYS 51', company: 'Sarepta', moa: 'Exon 51-skipping PMO', grp: 'Exon skipping', route: 'Intravenous', inds: ['DMD'], sponsor: 'sarepta' },
        { id: 'golodirsen', name: 'Golodirsen', brand: 'VYONDYS 53', company: 'Sarepta', moa: 'Exon 53-skipping PMO', grp: 'Exon skipping', route: 'Intravenous', codes: ['SRP-4053'], inds: ['DMD'], sponsor: 'sarepta' },
        { id: 'casimersen', name: 'Casimersen', brand: 'AMONDYS 45', company: 'Sarepta', moa: 'Exon 45-skipping PMO', grp: 'Exon skipping', route: 'Intravenous', codes: ['SRP-4045'], inds: ['DMD'], sponsor: 'sarepta' },
        { id: 'viltolarsen', name: 'Viltolarsen', brand: 'VILTEPSO', company: 'NS Pharma', moa: 'Exon 53-skipping PMO', grp: 'Exon skipping', route: 'Intravenous', codes: ['NS-065'], inds: ['DMD'], sponsor: 'ns pharma|nippon shinyaku' },
        { id: 'givinostat', name: 'Givinostat', brand: 'DUVYZAT', company: 'Italfarmaco', moa: 'HDAC inhibitor', grp: 'Anti-inflammatory / anti-fibrotic', route: 'Oral', codes: ['ITF2357'], inds: ['DMD'], sponsor: 'italfarmaco' },
        { id: 'vamorolone', name: 'Vamorolone', brand: 'AGAMREE', company: 'Santhera / Catalyst', moa: 'Dissociative steroidal anti-inflammatory', grp: 'Anti-inflammatory / anti-fibrotic', route: 'Oral', codes: ['VBP15'], inds: ['DMD'], sponsor: 'santhera|reveragen|catalyst' },
        { id: 'vutrisiran', name: 'Vutrisiran', brand: 'AMVUTTRA', company: 'Alnylam', moa: 'TTR-silencing siRNA', grp: 'TTR silencer', route: 'Injectable', codes: ['ALN-TTRsc02'], inds: ['ATTR'], sponsor: 'alnylam' },
        { id: 'patisiran', name: 'Patisiran', brand: 'ONPATTRO', company: 'Alnylam', moa: 'TTR-silencing siRNA (lipid nanoparticle)', grp: 'TTR silencer', route: 'Intravenous', codes: ['ALN-TTR02'], inds: ['ATTR'], sponsor: 'alnylam' },
        { id: 'eplontersen', name: 'Eplontersen', brand: 'WAINUA', company: 'Ionis / AstraZeneca', moa: 'TTR-silencing GalNAc antisense oligonucleotide', grp: 'TTR silencer', route: 'Injectable', codes: ['ION-682884'], inds: ['ATTR'], sponsor: 'ionis|akcea|astrazeneca' },
        { id: 'nexiguran', name: 'Nexiguran ziclumeran (NTLA-2001)', short: 'NTLA-2001', company: 'Intellia / Regeneron', moa: 'In vivo CRISPR TTR gene knockout', grp: 'TTR silencer', route: 'Intravenous', codes: ['NTLA-2001'], inds: ['ATTR'], sponsor: 'intellia|regeneron' },
        { id: 'tafamidis', name: 'Tafamidis', brand: 'VYNDAQEL', company: 'Pfizer', moa: 'TTR tetramer stabilizer', grp: 'TTR stabilizer', route: 'Oral', inds: ['ATTR'], sponsor: 'pfizer|foldrx' },
        { id: 'agalsidasebeta', name: 'Agalsidase beta', brand: 'FABRAZYME', company: 'Sanofi', moa: 'Alpha-galactosidase A ERT', grp: 'ERT', route: 'Intravenous', inds: ['FAB'], sponsor: 'sanofi|genzyme' },
        { id: 'pegunigalsidase', name: 'Pegunigalsidase alfa', short: 'Pegunigalsidase', brand: 'ELFABRIO', company: 'Chiesi / Protalix', moa: 'PEGylated alpha-galactosidase A ERT', grp: 'ERT', route: 'Intravenous', codes: ['PRX-102'], inds: ['FAB'], sponsor: 'protalix|chiesi' },
        { id: 'migalastat', name: 'Migalastat', brand: 'GALAFOLD', company: 'Amicus', moa: 'Pharmacological chaperone of alpha-galactosidase A', grp: 'Chaperone', route: 'Oral', inds: ['FAB'], sponsor: 'amicus' },
        { id: 'venglustat', name: 'Venglustat', company: 'Sanofi', moa: 'Glucosylceramide synthase inhibitor (brain-penetrant)', grp: 'Substrate reduction', route: 'Oral', inds: ['FAB', 'GAU'], sponsor: 'sanofi|genzyme' },
        { id: 'avalglucosidase', name: 'Avalglucosidase alfa', short: 'Avalglucosidase', brand: 'NEXVIAZYME', company: 'Sanofi', moa: 'Acid alpha-glucosidase ERT (M6P-enriched)', grp: 'ERT', route: 'Intravenous', inds: ['POM'], sponsor: 'sanofi|genzyme' },
        { id: 'cipaglucosidase', name: 'Cipaglucosidase alfa', short: 'Cipaglucosidase', brand: 'POMBILITI', company: 'Amicus', moa: 'Acid alpha-glucosidase ERT with miglustat stabilizer', grp: 'ERT', route: 'Intravenous', codes: ['ATB200'], inds: ['POM'], sponsor: 'amicus' },
        { id: 'imiglucerase', name: 'Imiglucerase', brand: 'CEREZYME', company: 'Sanofi', moa: 'Glucocerebrosidase ERT', grp: 'ERT', route: 'Intravenous', inds: ['GAU'], sponsor: 'sanofi|genzyme' },
        { id: 'velaglucerase', name: 'Velaglucerase alfa', short: 'Velaglucerase', brand: 'VPRIV', company: 'Takeda', moa: 'Glucocerebrosidase ERT', grp: 'ERT', route: 'Intravenous', inds: ['GAU'], sponsor: 'shire|takeda' },
        { id: 'eliglustat', name: 'Eliglustat', brand: 'CERDELGA', company: 'Sanofi', moa: 'Glucosylceramide synthase inhibitor', grp: 'Substrate reduction', route: 'Oral', inds: ['GAU'], sponsor: 'sanofi|genzyme' },
        { id: 'sepiapterin', name: 'Sepiapterin', brand: 'SEPHIENCE', company: 'PTC Therapeutics', moa: 'BH4 precursor / PAH chaperone', grp: 'Phe-lowering', route: 'Oral', codes: ['PTC923'], inds: ['PKU'], sponsor: 'ptc' },
        { id: 'sapropterin', name: 'Sapropterin', brand: 'KUVAN', company: 'BioMarin', moa: 'Synthetic BH4 (PAH cofactor)', grp: 'Phe-lowering', route: 'Oral', inds: ['PKU'], sponsor: 'biomarin' },
        { id: 'pegvaliase', name: 'Pegvaliase', brand: 'PALYNZIQ', company: 'BioMarin', moa: 'PEGylated phenylalanine ammonia lyase', grp: 'Phe-lowering', route: 'Injectable', inds: ['PKU'], sponsor: 'biomarin' },
        { id: 'omaveloxolone', name: 'Omaveloxolone', brand: 'SKYCLARYS', company: 'Biogen', moa: 'Nrf2 activator', grp: 'Nrf2 activator', route: 'Oral', inds: ['FA'], sponsor: 'reata|biogen' },
        { id: 'vosoritide', name: 'Vosoritide', brand: 'VOXZOGO', company: 'BioMarin', moa: 'C-type natriuretic peptide analog', grp: 'CNP / FGFR3', route: 'Injectable', codes: ['BMN 111'], inds: ['ACH'], sponsor: 'biomarin' },
        { id: 'navepegritide', name: 'Navepegritide (TransCon CNP)', short: 'Navepegritide', company: 'Ascendis', moa: 'Sustained-release CNP prodrug (weekly)', grp: 'CNP / FGFR3', route: 'Injectable', codes: ['TransCon CNP'], inds: ['ACH'], sponsor: 'ascendis' },
        { id: 'infigratinib', name: 'Infigratinib', company: 'BridgeBio', moa: 'FGFR1-3 tyrosine kinase inhibitor (low dose)', grp: 'CNP / FGFR3', route: 'Oral', codes: ['BGJ398'], inds: ['ACH'], epmc: '(infigratinib AND (achondroplasia OR "skeletal dysplasia"))', intr: 'infigratinib', sponsor: 'qed|bridgebio' },
        { id: 'idursulfase', name: 'Idursulfase', brand: 'ELAPRASE', company: 'Takeda', moa: 'Iduronate-2-sulfatase ERT (MPS II)', grp: 'ERT', route: 'Intravenous', inds: ['MPS'], sponsor: 'shire|takeda' },
        { id: 'tividenofusp', name: 'Tividenofusp alfa (DNL310)', short: 'Tividenofusp', company: 'Denali', moa: 'Brain-penetrant iduronate-2-sulfatase (transport vehicle)', grp: 'ERT', route: 'Intravenous', codes: ['DNL310'], inds: ['MPS'], sponsor: 'denali' }
      ],
      guides: [
        ['American College of Medical Genetics and Genomics', '("American College of Medical Genetics" OR ACMG)', 'https://www.acmg.net/', ['US']],
        ['American Academy of Neurology', '("American Academy of Neurology" OR AAN)', 'https://www.aan.com/practice/guidelines', ['US']],
        ['British Inherited Metabolic Disease Group', '(BIMDG OR "British Inherited Metabolic Disease Group")', 'https://www.bimdg.org.uk/', ['GB']],
        ['SSIEM', '(SSIEM OR "Society for the Study of Inborn Errors of Metabolism")', 'https://www.ssiem.org/', ['EU']],
        ['MetabERN', '(MetabERN OR "European Reference Network for Hereditary Metabolic Disorders")', 'https://metab.ern-net.eu/', ['EU']],
        ['EURO-NMD', '("EURO-NMD" OR "European Reference Network for Neuromuscular Diseases")', 'https://ern-euro-nmd.eu/', ['EU']],
        ['TREAT-NMD', '"TREAT-NMD"', 'https://www.treat-nmd.org/', ['*']]
      ],
      congresses: [
        ['WORLDSymposium', 'WORLDSymposium (lysosomal diseases)', 'https://worldsymposia.org/'],
        ['SSIEM', 'SSIEM Annual Symposium', 'https://www.ssiem.org/'],
        ['WMS', 'World Muscle Society Congress', 'https://www.worldmusclesociety.org/'],
        ['MDA', 'MDA Clinical & Scientific Conference', 'https://www.mdaconference.org/'],
        ['PPMD', 'Parent Project Muscular Dystrophy Annual Conference', 'https://www.parentprojectmd.org/'],
        ['PNS', 'Peripheral Nerve Society Annual Meeting', 'https://www.pnsociety.com/'],
        ['ASGCT', 'American Society of Gene & Cell Therapy Annual Meeting', 'https://www.asgct.org/'],
        ['ACMG', 'ACMG Annual Clinical Genetics Meeting', 'https://www.acmg.net/'],
        ['ESHG', 'European Human Genetics Conference', 'https://www.eshg.org/']
      ],
      advocacy: [
        ['NORD', 'Patient advocacy', ['*'], 'https://rarediseases.org'],
        ['EURORDIS', 'Patient advocacy', ['*'], 'https://www.eurordis.org'],
        ['Parent Project Muscular Dystrophy', 'Patient advocacy', ['DMD'], 'https://www.parentprojectmd.org'],
        ['Amyloidosis Foundation', 'Patient advocacy', ['ATTR'], 'https://amyloidosis.org'],
        ['National Fabry Disease Foundation', 'Patient advocacy', ['FAB'], 'https://www.fabrydisease.org'],
        ['Acid Maltase Deficiency Association', 'Patient advocacy', ['POM'], 'https://www.amda-pompe.org'],
        ['National Gaucher Foundation', 'Patient advocacy', ['GAU'], 'https://www.gaucherdisease.org'],
        ['National PKU Alliance', 'Patient advocacy', ['PKU'], 'https://npkua.org'],
        ['Friedreich\'s Ataxia Research Alliance', 'Patient advocacy', ['FA'], 'https://www.curefa.org'],
        ['National MPS Society', 'Patient advocacy', ['MPS'], 'https://mpssociety.org']
      ],
      themes: [
        ['Newborn screening', '("newborn screening" OR "neonatal screening")'],
        ['Gene therapy durability and safety', '(("gene therapy" OR AAV) AND (durab* OR "liver injury" OR hepatotoxicity OR "immune response"))'],
        ['ERT immunogenicity', '("anti-drug antibod*" OR "infusion-associated reaction*" OR "immune tolerance induction" OR CRIM)'],
        ['CNS disease and the blood-brain barrier', '("blood-brain barrier" OR neuronopathic OR "CNS manifestations")'],
        ['Home infusion', '("home infusion" OR "home-based infusion" OR "home therapy")'],
        ['Next-generation exon skipping', '("exon skipping" OR "peptide-conjugated" OR "antibody-oligonucleotide conjugate" OR PPMO)'],
        ['Surrogate endpoints and accelerated approval', '("surrogate endpoint*" OR "accelerated approval" OR "lyso-Gb3" OR "micro-dystrophin" OR "neurofilament light")'],
        ['Natural history and external controls', '("natural history" OR "external control*" OR "synthetic control arm")'],
        ['Gene editing', '(CRISPR OR "gene editing" OR "base editing")']
      ],
      pros: ['PedsQL', 'PODCI', 'Norfolk QOL-DN', 'COMPASS-31', 'R-PAct', 'BPI', 'FA-ADL', 'SF-36'],
      endpoints: [[/NSAA|North Star/i, 'NSAA'], [/time to (rise|stand)|stand from supine/i, 'Time to rise'], [/micro-?dystrophin|dystrophin (expression|production)/i, 'Dystrophin expression'], [/mNIS\+7|NIS\+7|neuropathy impairment/i, 'mNIS+7'], [/lyso-?Gb3|\bGL-?3\b|globotriaosyl/i, 'Gb3 / lyso-Gb3'], [/phenylalanine|\bPhe\b/i, 'Blood Phe'], [/FARS/i, 'mFARS'], [/growth velocity|\bAGV\b/i, 'Annualized growth velocity'], [/spleen volume|splenomegaly/i, 'Spleen volume'], [/heparan sulfate|glycosaminoglycan|urinary GAG/i, 'GAG / heparan sulfate'], [/6MWT|6-minute walk|six[- ]minute walk/i, '6MWT'], [/FVC|forced vital capacity/i, 'FVC']],
      elig: [[/ambula/i, 'Ambulatory status'], [/amenable|exon \d|genotype|pathogenic variant|mutation/i, 'Genotype or mutation amenability'], [/\bAAV|neutrali[sz]ing antibod/i, 'AAV antibody status'], [/corticosteroid|steroid/i, 'Stable corticosteroid regimen'], [/enzyme replacement|\bERT\b|treatment[- ]na[iï]ve/i, 'Prior ERT status'], [/phenylalanine|\bPhe\b/i, 'Blood Phe threshold'], [/FVC|forced vital capacity/i, 'Respiratory function']],
      gaps: [
        ['adult', 'Adult and late-onset disease', '(adult OR adults OR "late-onset" OR attenuated)'],
        ['nonamb', 'Non-ambulatory and advanced disease', '("non-ambulatory" OR nonambulatory OR "advanced disease")'],
        ['cns', 'CNS manifestations', '(neuronopathic OR cognitive OR "central nervous system")'],
        ['female', 'Female patients and heterozygotes', '("female carrier*" OR heterozygous OR "female patients")']
      ],
      pops: [
        ['presym', 'Presymptomatic and newborn-screened', '(presymptomatic OR "pre-symptomatic" OR "newborn screening")', 'presymptomatic[tiab] OR "newborn screening"[tiab]'],
        ['carrier', 'Female carriers', '("female carrier*" OR "heterozygous females")', '"female carriers"[tiab] OR "heterozygous females"[tiab]']
      ]
    },
  {
      id: 'RESP', name: 'Respiratory & allergy', short: 'Respiratory',
      desc: 'Airway, fibrotic and allergic disease: asthma, COPD, pulmonary fibrosis, cystic fibrosis and allergy',
      fedTerms: ['asthma', 'chronic obstructive pulmonary disease'],
      specialties: 'pulmon|allergy|immunolog|critical care|sleep',
      inds: [
        { id: 'ASTH', name: 'Asthma', short: 'asthma', abbr: [], syn: ['severe asthma', 'eosinophilic asthma', 'bronchial asthma'], epmc: '(asthma)', ct: 'asthma', re: /asthma/i, label: /asthma/i, core: true },
        { id: 'COPD', name: 'Chronic obstructive pulmonary disease', short: 'COPD', abbr: ['copd'], syn: ['emphysema', 'chronic bronchitis'], epmc: '("chronic obstructive pulmonary disease" OR COPD)', ct: 'COPD', re: /\bCOPD\b|chronic obstructive|emphysema|chronic bronchitis/i, label: /chronic obstructive pulmonary disease|\bCOPD\b/i, core: true },
        { id: 'CF', name: 'Cystic fibrosis', short: 'cystic fibrosis', abbr: ['cf'], syn: [], epmc: '("cystic fibrosis")', ct: 'cystic fibrosis', re: /cystic fibrosis/i, not: /non.?cystic|non-?CF\b|bronchiectasis/i, label: /(?<!non.)cystic fibrosis/i, core: true },
        { id: 'IPF', name: 'IPF / progressive pulmonary fibrosis', short: 'pulmonary fibrosis', abbr: ['ipf', 'ppf'], syn: ['idiopathic pulmonary fibrosis', 'progressive pulmonary fibrosis', 'progressive fibrosing ild'], epmc: '("idiopathic pulmonary fibrosis" OR "progressive pulmonary fibrosis" OR "progressive fibrosing interstitial lung disease")', ct: 'pulmonary fibrosis', re: /pulmonary fibrosis|fibrosing interstitial|\bIPF\b|\bPPF\b/i, not: /cystic/i, label: /pulmonary fibrosis|fibrosing interstitial lung/i },
        { id: 'CRSwNP', name: 'Chronic rhinosinusitis with nasal polyps', short: 'nasal polyps', abbr: ['crswnp'], syn: ['nasal polyps', 'nasal polyposis'], epmc: '("nasal polyps" OR "nasal polyposis" OR "chronic rhinosinusitis")', ct: 'nasal polyps', re: /nasal polyp|rhinosinusitis/i, label: /nasal polyp/i },
        { id: 'BE', name: 'Non-CF bronchiectasis', short: 'bronchiectasis', abbr: ['ncfb', 'ncfbe'], syn: ['bronchiectasis', 'non-cystic fibrosis bronchiectasis'], epmc: '(bronchiectasis)', ct: 'bronchiectasis', re: /bronchiectasis/i, label: /bronchiectasis/i },
        { id: 'FA', name: 'Food allergy', short: 'food allergy', abbr: [], syn: ['peanut allergy', 'ige-mediated food allergy'], epmc: '("food allergy" OR "peanut allergy")', ct: 'food allergy', re: /food allerg|peanut allerg|(milk|egg|nut) allerg/i, label: /food allergy|peanut allergy/i },
        { id: 'AR', name: 'Allergic rhinitis', short: 'allergic rhinitis', abbr: ['ar'], syn: ['hay fever', 'allergic rhinoconjunctivitis'], epmc: '("allergic rhinitis" OR "allergic rhinoconjunctivitis" OR "hay fever")', ct: 'allergic rhinitis', re: /allergic rhin|hay fever|pollinosis/i, label: /allergic rhinitis/i }
      ],
      assets: [
        { id: 'dupilumab', name: 'Dupilumab', brand: 'DUPIXENT', company: 'Sanofi / Regeneron', moa: 'IL-4Rα antagonist', grp: 'IL-4R / IL-13', route: 'Injectable', inds: ['ASTH', 'COPD', 'CRSwNP'], sponsor: 'regeneron|sanofi' },
        { id: 'mepolizumab', name: 'Mepolizumab', brand: 'NUCALA', company: 'GSK', moa: 'Anti-IL-5', grp: 'IL-5 / IL-5R', route: 'Injectable', inds: ['ASTH', 'COPD', 'CRSwNP'], sponsor: 'glaxo|gsk' },
        { id: 'benralizumab', name: 'Benralizumab', brand: 'FASENRA', company: 'AstraZeneca', moa: 'Anti-IL-5Rα (eosinophil depleting)', grp: 'IL-5 / IL-5R', route: 'Injectable', inds: ['ASTH', 'COPD', 'CRSwNP'], sponsor: 'astrazeneca|medimmune' },
        { id: 'reslizumab', name: 'Reslizumab', brand: 'CINQAIR', company: 'Teva', moa: 'Anti-IL-5', grp: 'IL-5 / IL-5R', route: 'Intravenous', inds: ['ASTH'], sponsor: 'teva' },
        { id: 'depemokimab', name: 'Depemokimab', brand: 'EXDENSUR', company: 'GSK', moa: 'Long-acting anti-IL-5 (twice yearly)', grp: 'IL-5 / IL-5R', route: 'Injectable', codes: ['GSK3511294'], inds: ['ASTH', 'CRSwNP'], sponsor: 'glaxo|gsk' },
        { id: 'tezepelumab', name: 'Tezepelumab', brand: 'TEZSPIRE', company: 'Amgen / AstraZeneca', moa: 'Anti-TSLP', grp: 'TSLP', route: 'Injectable', inds: ['ASTH', 'COPD', 'CRSwNP'], sponsor: 'amgen|astrazeneca|medimmune' },
        { id: 'omalizumab', name: 'Omalizumab', brand: 'XOLAIR', company: 'Genentech / Novartis', moa: 'Anti-IgE', grp: 'IgE', route: 'Injectable', inds: ['ASTH', 'CRSwNP', 'FA'], sponsor: 'genentech|novartis|roche' },
        { id: 'itepekimab', name: 'Itepekimab', company: 'Sanofi / Regeneron', moa: 'Anti-IL-33', grp: 'IL-33 / ST2', route: 'Injectable', codes: ['REGN3500', 'SAR440340'], inds: ['COPD'], sponsor: 'regeneron|sanofi' },
        { id: 'tozorakimab', name: 'Tozorakimab', company: 'AstraZeneca', moa: 'Anti-IL-33', grp: 'IL-33 / ST2', route: 'Injectable', codes: ['MEDI3506'], inds: ['COPD'], sponsor: 'astrazeneca|medimmune' },
        { id: 'astegolimab', name: 'Astegolimab', company: 'Roche', moa: 'Anti-ST2 (IL-33 receptor)', grp: 'IL-33 / ST2', route: 'Injectable', codes: ['MSTT1041A'], inds: ['COPD'], sponsor: 'genentech|roche|hoffmann' },
        { id: 'ensifentrine', name: 'Ensifentrine', brand: 'OHTUVAYRE', company: 'Merck & Co. (Verona Pharma)', moa: 'Inhaled PDE3/PDE4 inhibitor', grp: 'PDE inhibitor', route: 'Inhaled', codes: ['RPL554'], inds: ['COPD'], sponsor: 'verona|merck sharp' },
        { id: 'roflumilastoral', name: 'Roflumilast (oral)', short: 'Roflumilast', brand: 'DALIRESP', company: 'AstraZeneca', moa: 'PDE4 inhibitor', grp: 'PDE inhibitor', route: 'Oral', inds: ['COPD'], epmc: '(roflumilast AND (COPD OR "chronic obstructive" OR oral OR tablet))', intr: 'roflumilast', sponsor: 'astrazeneca|takeda|nycomed|forest', labelRoute: 'ORAL' },
        { id: 'ffumecvi', name: 'Fluticasone furoate / umeclidinium / vilanterol', short: 'FF/UMEC/VI', brand: 'TRELEGY ELLIPTA', generic: 'fluticasone furoate, umeclidinium', company: 'GSK', moa: 'ICS / LAMA / LABA single-inhaler triple', grp: 'Inhaled combination', route: 'Inhaled', inds: ['ASTH', 'COPD'], epmc: '(Trelegy OR ("fluticasone furoate" AND umeclidinium AND vilanterol))', intr: '(umeclidinium AND vilanterol AND "fluticasone furoate")', sponsor: 'glaxo|gsk' },
        { id: 'budglyfor', name: 'Budesonide / glycopyrrolate / formoterol', short: 'BGF', brand: 'BREZTRI AEROSPHERE', generic: 'budesonide, glycopyrrolate', company: 'AstraZeneca', moa: 'ICS / LAMA / LABA single-inhaler triple', grp: 'Inhaled combination', route: 'Inhaled', inds: ['COPD', 'ASTH'], epmc: '(Breztri OR Trixeo OR (budesonide AND (glycopyrronium OR glycopyrrolate) AND formoterol))', intr: '("BGF MDI" OR (budesonide AND glycopyrronium AND formoterol))', sponsor: 'astrazeneca|pearl' },
        { id: 'albuterolbudesonide', name: 'Albuterol / budesonide', short: 'Albuterol/budesonide', brand: 'AIRSUPRA', generic: 'albuterol and budesonide', company: 'AstraZeneca', moa: 'As-needed SABA + ICS rescue', grp: 'Inhaled combination', route: 'Inhaled', inds: ['ASTH'], epmc: '(Airsupra OR "albuterol/budesonide" OR "albuterol-budesonide" OR "BDA MDI")', intr: '("BDA MDI" OR (albuterol AND budesonide))', sponsor: 'astrazeneca|avillion' },
        { id: 'elexacaftor', name: 'Elexacaftor / tezacaftor / ivacaftor', short: 'ELX/TEZ/IVA', brand: 'TRIKAFTA', generic: 'elexacaftor', company: 'Vertex', moa: 'CFTR correctors + potentiator', grp: 'CFTR modulator', route: 'Oral', codes: ['VX-445'], inds: ['CF'], epmc: '(elexacaftor OR Trikafta OR Kaftrio OR "VX-445")', intr: 'elexacaftor OR "VX-445"', sponsor: 'vertex' },
        { id: 'vanzacaftor', name: 'Vanzacaftor / tezacaftor / deutivacaftor', short: 'Vanzacaftor triple', brand: 'ALYFTREK', generic: 'vanzacaftor', company: 'Vertex', moa: 'Once-daily CFTR correctors + potentiator', grp: 'CFTR modulator', route: 'Oral', codes: ['VX-121', 'VX-561'], inds: ['CF'], epmc: '(vanzacaftor OR Alyftrek OR "VX-121")', intr: 'vanzacaftor OR "VX-121"', sponsor: 'vertex' },
        { id: 'ivacaftor', name: 'Ivacaftor', brand: 'KALYDECO', company: 'Vertex', moa: 'CFTR potentiator', grp: 'CFTR modulator', route: 'Oral', codes: ['VX-770'], inds: ['CF'], sponsor: 'vertex' },
        { id: 'nintedanib', name: 'Nintedanib', brand: 'OFEV', company: 'Boehringer Ingelheim', moa: 'Tyrosine kinase inhibitor (VEGFR/FGFR/PDGFR)', grp: 'Antifibrotic', route: 'Oral', inds: ['IPF'], sponsor: 'boehringer' },
        { id: 'pirfenidone', name: 'Pirfenidone', brand: 'ESBRIET', company: 'Genentech', moa: 'Antifibrotic (TGF-β pathway)', grp: 'Antifibrotic', route: 'Oral', inds: ['IPF'], sponsor: 'genentech|roche|hoffmann|intermune' },
        { id: 'nerandomilast', name: 'Nerandomilast', brand: 'JASCAYD', company: 'Boehringer Ingelheim', moa: 'Preferential PDE4B inhibitor', grp: 'Antifibrotic', route: 'Oral', codes: ['BI 1015550'], inds: ['IPF'], sponsor: 'boehringer' },
        { id: 'admilparant', name: 'Admilparant', company: 'BMS', moa: 'LPA1 receptor antagonist', grp: 'Antifibrotic', route: 'Oral', codes: ['BMS-986278'], inds: ['IPF'], sponsor: 'bristol' },
        { id: 'treprostinil', name: 'Treprostinil (inhaled)', short: 'Treprostinil', brand: 'TYVASO', company: 'United Therapeutics', moa: 'Prostacyclin analogue', grp: 'Prostacyclin', route: 'Inhaled', inds: ['IPF'], epmc: '(treprostinil AND (inhaled OR Tyvaso OR "pulmonary fibrosis" OR "interstitial lung"))', intr: 'treprostinil', sponsor: 'united therapeutics', labelRoute: 'RESPIRATORY (INHALATION)' },
        { id: 'brensocatib', name: 'Brensocatib', brand: 'BRINSUPRI', company: 'Insmed', moa: 'DPP1 (cathepsin C) inhibitor', grp: 'DPP1 inhibitor', route: 'Oral', codes: ['INS1007'], inds: ['BE'], sponsor: 'insmed' },
        { id: 'peanutpowder', name: 'Peanut (Arachis hypogaea) allergen powder', short: 'AR101', brand: 'PALFORZIA', generic: 'peanut (arachis hypogaea) allergen powder', company: 'Stallergenes Greer', moa: 'Oral immunotherapy (peanut protein)', grp: 'Allergen immunotherapy', route: 'Oral', codes: ['AR101'], inds: ['FA'], epmc: '(Palforzia OR AR101 OR "peanut allergen powder")', intr: '(Palforzia OR AR101 OR "peanut allergen powder")', sponsor: 'aimmune|stallergenes|nestl' },
        { id: 'viaskinpeanut', name: 'Viaskin Peanut (DBV712)', short: 'Viaskin Peanut', company: 'DBV Technologies', moa: 'Epicutaneous immunotherapy (peanut)', grp: 'Allergen immunotherapy', route: 'Topical', codes: ['DBV712'], inds: ['FA'], epmc: '(Viaskin OR DBV712)', intr: 'Viaskin OR DBV712', sponsor: 'dbv' },
        { id: 'hdmslit', name: 'House dust mite allergen extract (SLIT-tablet)', short: 'HDM SLIT-tablet', brand: 'ODACTRA', generic: 'dermatophagoides farinae', company: 'ALK-Abelló', moa: 'Sublingual allergen immunotherapy', grp: 'Allergen immunotherapy', route: 'Oral', codes: ['MK-8237'], inds: ['AR'], epmc: '(Odactra OR Acarizax OR "MK-8237" OR "HDM SLIT-tablet")', intr: '(Odactra OR Acarizax OR "MK-8237" OR "HDM SLIT-tablet")', sponsor: 'alk-abell|merck sharp' }
      ],
      guides: [
        ['GINA', '("Global Initiative for Asthma" OR GINA)', 'https://ginasthma.org/', ['*']],
        ['GOLD', '("Global Initiative for Chronic Obstructive Lung Disease" OR "GOLD report")', 'https://goldcopd.org/', ['*']],
        ['American Thoracic Society', '"American Thoracic Society"', 'https://www.thoracic.org/', ['US']],
        ['AAAAI / ACAAI Joint Task Force', '("Joint Task Force" OR "American Academy of Allergy, Asthma")', 'https://www.aaaai.org/', ['US']],
        ['Cystic Fibrosis Foundation', '"Cystic Fibrosis Foundation"', 'https://www.cff.org/', ['US']],
        ['Canadian Thoracic Society', '"Canadian Thoracic Society"', 'https://cts-sct.ca/', ['CA']],
        ['British Thoracic Society', '"British Thoracic Society"', 'https://www.brit-thoracic.org.uk/', ['GB']],
        ['European Respiratory Society', '"European Respiratory Society"', 'https://www.ersnet.org/', ['EU']],
        ['EAACI', '(EAACI OR "European Academy of Allergy and Clinical Immunology")', 'https://eaaci.org/', ['EU']],
        ['Japanese Respiratory Society', '"Japanese Respiratory Society"', 'https://www.jrs.or.jp/', ['JP']]
      ],
      congresses: [
        ['ATS', 'American Thoracic Society International Conference', 'https://conference.thoracic.org/'],
        ['ERS', 'European Respiratory Society Congress', 'https://www.ersnet.org/'],
        ['CHEST', 'CHEST Annual Meeting', 'https://www.chestnet.org/'],
        ['AAAAI', 'AAAAI Annual Meeting', 'https://www.aaaai.org/'],
        ['ACAAI', 'ACAAI Annual Scientific Meeting', 'https://acaai.org/'],
        ['EAACI', 'EAACI Congress', 'https://eaaci.org/'],
        ['NACFC', 'North American Cystic Fibrosis Conference', 'https://www.nacfconference.org/'],
        ['ECFS', 'European Cystic Fibrosis Conference', 'https://www.ecfs.eu/'],
        ['BTS', 'British Thoracic Society Winter Meeting', 'https://www.brit-thoracic.org.uk/'],
        ['APSR', 'Asian Pacific Society of Respirology Congress', 'https://www.apsresp.org/']
      ],
      advocacy: [
        ['Asthma and Allergy Foundation of America', 'Patient advocacy', ['ASTH', 'FA', 'AR'], 'https://aafa.org'],
        ['Allergy & Asthma Network', 'Patient advocacy', ['ASTH', 'FA', 'AR', 'CRSwNP'], 'https://allergyasthmanetwork.org'],
        ['American Lung Association', 'Patient advocacy', ['*'], 'https://www.lung.org'],
        ['COPD Foundation', 'Patient advocacy', ['COPD', 'BE'], 'https://www.copdfoundation.org'],
        ['Pulmonary Fibrosis Foundation', 'Patient advocacy', ['IPF'], 'https://www.pulmonaryfibrosis.org'],
        ['Cystic Fibrosis Foundation', 'Patient advocacy', ['CF'], 'https://www.cff.org'],
        ['FARE (Food Allergy Research & Education)', 'Patient advocacy', ['FA'], 'https://www.foodallergy.org'],
        ['European Lung Foundation', 'Patient advocacy', ['*'], 'https://europeanlung.org']
      ],
      themes: [
        ['Clinical remission on biologics', '("clinical remission" OR "super-responder" OR "super responder")'],
        ['Oral corticosteroid stewardship', '("oral corticosteroid" OR "OCS-sparing" OR "OCS burden" OR "steroid-sparing")'],
        ['Type 2 inflammation in COPD', '(COPD AND (eosinophil* OR "type 2" OR FeNO))'],
        ['Alarmins (TSLP, IL-33)', '(TSLP OR "thymic stromal lymphopoietin" OR "IL-33" OR ST2 OR alarmin*)'],
        ['Anti-inflammatory reliever therapy', '("anti-inflammatory reliever" OR MART OR SMART OR "as-needed budesonide" OR "albuterol-budesonide")'],
        ['Progressive pulmonary fibrosis', '("progressive pulmonary fibrosis" OR "progressive fibrosing")'],
        ['CFTR modulators long term', '("CFTR modulator" OR "highly effective modulator" OR HEMT)'],
        ['Neutrophilic inflammation and DPP1', '(DPP1 OR "dipeptidyl peptidase 1" OR "cathepsin C" OR "neutrophil elastase")'],
        ['Food allergy immunotherapy', '("oral immunotherapy" OR "epicutaneous immunotherapy" OR "sublingual immunotherapy")'],
        ['Inhaler carbon footprint', '("carbon footprint" OR propellant OR "global warming potential" OR HFA-152a OR HFO-1234ze)']
      ],
      pros: ['ACQ', 'ACT', 'AQLQ', 'SGRQ', 'CAT', 'E-RS', 'SNOT-22', 'K-BILD', 'CFQ-R', 'QOL-B'],
      endpoints: [[/sweat chloride/i, 'Sweat chloride'], [/nasal polyp score|\bNPS\b|nasal congestion/i, 'Nasal polyp score / congestion'], [/food challenge|DBPCFC|eliciting dose|peanut protein/i, 'Food challenge tolerance'], [/total nasal symptom|\bTNSS\b|symptom and medication score|\bCSMS\b/i, 'Nasal symptom score'], [/oral corticosteroid|\bOCS\b/i, 'OCS reduction'], [/exacerbation/i, 'Exacerbation rate'], [/ppFEV1|percent predicted FEV1/i, 'ppFEV1'], [/FEV1|FEV 1/i, 'FEV1'], [/\bFVC\b|forced vital capacity/i, 'FVC decline'], [/\bACQ|asthma control/i, 'Asthma control'], [/SGRQ/i, 'SGRQ']],
      elig: [[/eosinophil|\bEOS\b/i, 'Blood eosinophil threshold'], [/FeNO|exhaled nitric oxide/i, 'FeNO threshold'], [/exacerbation/i, 'Prior exacerbation history'], [/FEV1|reversibility|bronchodilator/i, 'Lung function / reversibility'], [/smok|pack-year/i, 'Smoking history'], [/\bICS\b|inhaled corticosteroid|triple therapy|\bLABA\b|\bLAMA\b/i, 'Background inhaler therapy'], [/CFTR|F508del|genotype/i, 'CFTR genotype'], [/\bIgE\b|skin prick|food challenge/i, 'IgE / sensitisation']],
      gaps: [
        ['t2low', 'T2-low disease', '("T2-low" OR "type 2-low" OR "low eosinophil" OR "non-eosinophilic")'],
        ['remission', 'Clinical remission', '("clinical remission" OR "super-responder")'],
        ['cfrare', 'Rare CFTR variants', '("rare variants" OR "non-F508del" OR N1303K OR "minimal function")']
      ],
      pops: [['smk', 'Current smokers', '("current smokers" OR "active smokers")', '"current smokers"[tiab] OR "active smokers"[tiab]']]
    },
    {
      id: 'RHEUM', name: 'Rheumatology', short: 'Rheumatology',
      desc: 'Inflammatory arthritis, connective tissue disease, vasculitis and gout',
      fedTerms: ['rheumatoid arthritis', 'lupus'],
      specialties: 'rheumatolog',
      inds: [
        { id: 'RA', name: 'Rheumatoid arthritis', short: 'rheumatoid arthritis', abbr: ['ra'], syn: [], epmc: '("rheumatoid arthritis")', ct: 'rheumatoid arthritis', re: /rheumatoid arthritis/i, not: /juvenile/i, label: /rheumatoid arthritis/i, core: true },
        { id: 'PsA', name: 'Psoriatic arthritis', short: 'psoriatic arthritis', abbr: ['psa'], syn: [], epmc: '("psoriatic arthritis")', ct: 'psoriatic arthritis', re: /psoriatic arthrit/i, label: /psoriatic arthritis/i, core: true },
        { id: 'AXSPA', name: 'Axial spondyloarthritis', short: 'axial spondyloarthritis', abbr: ['axspa', 'nr-axspa'], syn: ['ankylosing spondylitis', 'non-radiographic axial spondyloarthritis'], epmc: '("axial spondyloarthritis" OR "ankylosing spondylitis" OR "non-radiographic axial")', ct: 'axial spondyloarthritis', re: /spondyloarthrit|spondylarthrit|ankylosing spondylitis|axSpA/i, label: /ankylosing spondylitis|axial spondyloarthritis/i, core: true },
        { id: 'SLE', name: 'Systemic lupus erythematosus', short: 'lupus', abbr: ['sle'], syn: ['lupus', 'systemic lupus'], epmc: '("systemic lupus erythematosus" OR SLE)', ct: 'systemic lupus erythematosus', re: /systemic lupus|\bSLE\b/i, not: /nephritis|cutaneous|discoid/i, label: /systemic lupus erythematosus/i },
        { id: 'LN', name: 'Lupus nephritis', short: 'lupus nephritis', abbr: ['ln'], syn: [], epmc: '("lupus nephritis")', ct: 'lupus nephritis', re: /lupus nephritis/i, label: /lupus nephritis/i },
        { id: 'GOUT', name: 'Gout', short: 'gout', abbr: [], syn: ['hyperuricemia', 'uncontrolled gout'], epmc: '(gout OR hyperuricemia OR hyperuricaemia)', ct: 'gout', re: /gout|hyperuric/i, label: /gout/i },
        { id: 'SJD', name: "Sjögren's disease", short: "Sjögren's disease", abbr: ['sjd', 'pss'], syn: ["sjogren's syndrome", "sjögren's syndrome", "sjogren's disease"], epmc: '(Sjogren* OR Sjögren*)', ct: 'Sjogren', re: /sj[oö]gren/i, label: /sj[oö]gren/i },
        { id: 'GCA', name: 'Giant cell arteritis', short: 'giant cell arteritis', abbr: ['gca'], syn: ['temporal arteritis'], epmc: '("giant cell arteritis" OR "temporal arteritis")', ct: 'giant cell arteritis', re: /giant cell arteritis|temporal arteritis/i, label: /giant cell arteritis/i },
        { id: 'SSCILD', name: 'Systemic sclerosis-ILD', short: 'systemic sclerosis-associated ILD', abbr: ['ssc-ild', 'ssc'], syn: ['systemic sclerosis', 'scleroderma', 'scleroderma lung disease'], epmc: '(("systemic sclerosis" OR scleroderma) AND ("interstitial lung" OR ILD))', ct: 'systemic sclerosis', re: /systemic sclerosis|scleroderma/i, not: /localized scleroderma|morphea/i, label: /systemic sclerosis|scleroderma/i }
      ],
      assets: [
        { id: 'adalimumab', name: 'Adalimumab', brand: 'HUMIRA', company: 'AbbVie', moa: 'Anti-TNF', grp: 'TNF', route: 'Injectable', inds: ['RA', 'PsA', 'AXSPA'], sponsor: 'abbvie|abbott' },
        { id: 'etanercept', name: 'Etanercept', brand: 'ENBREL', company: 'Amgen', moa: 'TNF receptor fusion protein', grp: 'TNF', route: 'Injectable', inds: ['RA', 'PsA', 'AXSPA'], sponsor: 'amgen|immunex|pfizer|wyeth' },
        { id: 'certolizumab', name: 'Certolizumab pegol', short: 'Certolizumab', brand: 'CIMZIA', company: 'UCB', moa: 'PEGylated anti-TNF Fab′', grp: 'TNF', route: 'Injectable', codes: ['CDP870'], inds: ['RA', 'PsA', 'AXSPA'], sponsor: 'ucb' },
        { id: 'tocilizumab', name: 'Tocilizumab', brand: 'ACTEMRA', company: 'Genentech / Roche', moa: 'IL-6R antagonist', grp: 'IL-6', route: 'Injectable', inds: ['RA', 'GCA', 'SSCILD'], sponsor: 'genentech|roche|hoffmann|chugai' },
        { id: 'sarilumab', name: 'Sarilumab', brand: 'KEVZARA', company: 'Sanofi / Regeneron', moa: 'IL-6R antagonist', grp: 'IL-6', route: 'Injectable', inds: ['RA'], sponsor: 'sanofi|regeneron' },
        { id: 'abatacept', name: 'Abatacept', brand: 'ORENCIA', company: 'BMS', moa: 'CTLA4-Ig (CD80/86 co-stimulation blocker)', grp: 'Co-stimulation', route: 'Injectable', inds: ['RA', 'PsA'], sponsor: 'bristol' },
        { id: 'rituximab', name: 'Rituximab', brand: 'RITUXAN', company: 'Genentech / Biogen', moa: 'Anti-CD20', grp: 'B-cell', route: 'Intravenous', inds: ['RA'], epmc: '(rituximab AND (rheumatoid OR rheumatic OR arthritis))', intr: 'rituximab', sponsor: 'genentech|roche|hoffmann|biogen' },
        { id: 'tofacitinib', name: 'Tofacitinib', brand: 'XELJANZ', company: 'Pfizer', moa: 'JAK inhibitor', grp: 'JAK / TYK2', route: 'Oral', inds: ['RA', 'PsA', 'AXSPA'], sponsor: 'pfizer' },
        { id: 'baricitinib', name: 'Baricitinib', brand: 'OLUMIANT', company: 'Lilly', moa: 'JAK1/JAK2 inhibitor', grp: 'JAK / TYK2', route: 'Oral', inds: ['RA'], sponsor: 'lilly|incyte' },
        { id: 'upadacitinib', name: 'Upadacitinib', brand: 'RINVOQ', company: 'AbbVie', moa: 'JAK1 inhibitor', grp: 'JAK / TYK2', route: 'Oral', inds: ['RA', 'PsA', 'AXSPA', 'GCA', 'SLE'], sponsor: 'abbvie', labelRoute: 'ORAL' },
        { id: 'deucravacitinib', name: 'Deucravacitinib', brand: 'SOTYKTU', company: 'BMS', moa: 'TYK2 inhibitor', grp: 'JAK / TYK2', route: 'Oral', inds: ['PsA', 'SLE', 'SJD'], sponsor: 'bristol', labelRoute: 'ORAL' },
        { id: 'secukinumab', name: 'Secukinumab', brand: 'COSENTYX', company: 'Novartis', moa: 'IL-17A inhibitor', grp: 'IL-23 / IL-17', route: 'Injectable', inds: ['PsA', 'AXSPA'], sponsor: 'novartis' },
        { id: 'ixekizumab', name: 'Ixekizumab', brand: 'TALTZ', company: 'Lilly', moa: 'IL-17A inhibitor', grp: 'IL-23 / IL-17', route: 'Injectable', inds: ['PsA', 'AXSPA'], sponsor: 'lilly' },
        { id: 'bimekizumab', name: 'Bimekizumab', brand: 'BIMZELX', company: 'UCB', moa: 'IL-17A/F inhibitor', grp: 'IL-23 / IL-17', route: 'Injectable', inds: ['PsA', 'AXSPA'], sponsor: 'ucb' },
        { id: 'guselkumab', name: 'Guselkumab', brand: 'TREMFYA', company: 'Johnson & Johnson', moa: 'IL-23p19 inhibitor', grp: 'IL-23 / IL-17', route: 'Injectable', inds: ['PsA'], sponsor: 'janssen|johnson' },
        { id: 'risankizumab', name: 'Risankizumab', brand: 'SKYRIZI', company: 'AbbVie', moa: 'IL-23p19 inhibitor', grp: 'IL-23 / IL-17', route: 'Injectable', inds: ['PsA'], sponsor: 'abbvie|boehringer' },
        { id: 'apremilast', name: 'Apremilast', brand: 'OTEZLA', company: 'Amgen', moa: 'PDE4 inhibitor', grp: 'PDE4', route: 'Oral', inds: ['PsA'], sponsor: 'amgen|celgene', labelRoute: 'ORAL' },
        { id: 'belimumab', name: 'Belimumab', brand: 'BENLYSTA', company: 'GSK', moa: 'Anti-BLyS (BAFF)', grp: 'B-cell', route: 'Injectable', inds: ['SLE', 'LN'], sponsor: 'glaxo|gsk|human genome' },
        { id: 'obinutuzumab', name: 'Obinutuzumab', brand: 'GAZYVA', company: 'Genentech / Roche', moa: 'Type II anti-CD20', grp: 'B-cell', route: 'Intravenous', inds: ['LN', 'SLE'], epmc: '(obinutuzumab AND (lupus OR nephritis))', intr: 'obinutuzumab', sponsor: 'genentech|roche|hoffmann' },
        { id: 'ianalumab', name: 'Ianalumab', company: 'Novartis', moa: 'Anti-BAFF-R', grp: 'B-cell', route: 'Injectable', codes: ['VAY736'], inds: ['SJD', 'SLE', 'LN'], sponsor: 'novartis' },
        { id: 'anifrolumab', name: 'Anifrolumab', brand: 'SAPHNELO', company: 'AstraZeneca', moa: 'Type I IFN receptor antagonist', grp: 'Type I IFN / pDC', route: 'Intravenous', codes: ['MEDI-546'], inds: ['SLE', 'LN'], sponsor: 'astrazeneca|medimmune' },
        { id: 'litifilimab', name: 'Litifilimab', company: 'Biogen', moa: 'Anti-BDCA2 (plasmacytoid DC)', grp: 'Type I IFN / pDC', route: 'Injectable', codes: ['BIIB059'], inds: ['SLE'], sponsor: 'biogen' },
        { id: 'dapirolizumab', name: 'Dapirolizumab pegol', short: 'Dapirolizumab', company: 'UCB / Biogen', moa: 'Anti-CD40L (Fc-free, PEGylated)', grp: 'Co-stimulation', route: 'Intravenous', codes: ['CDP7657'], inds: ['SLE'], sponsor: 'ucb|biogen' },
        { id: 'dazodalibep', name: 'Dazodalibep', company: 'Amgen', moa: 'CD40L antagonist fusion protein', grp: 'Co-stimulation', route: 'Intravenous', codes: ['HZN4920', 'VIB4920'], inds: ['SJD'], sponsor: 'amgen|horizon|viela' },
        { id: 'nipocalimab', name: 'Nipocalimab', brand: 'IMAAVY', company: 'Johnson & Johnson', moa: 'Anti-FcRn', grp: 'FcRn', route: 'Intravenous', codes: ['M281'], inds: ['SJD'], sponsor: 'janssen|johnson|momenta' },
        { id: 'voclosporin', name: 'Voclosporin', brand: 'LUPKYNIS', company: 'Aurinia', moa: 'Calcineurin inhibitor', grp: 'Calcineurin inhibitor', route: 'Oral', inds: ['LN'], sponsor: 'aurinia' },
        { id: 'pegloticase', name: 'Pegloticase', brand: 'KRYSTEXXA', company: 'Amgen', moa: 'PEGylated uricase', grp: 'Urate-lowering', route: 'Intravenous', inds: ['GOUT'], sponsor: 'horizon|amgen|savient' },
        { id: 'sel212', name: 'SEL-212 (pegadricase + ImmTOR)', short: 'SEL-212', company: 'Sobi', moa: 'PEGylated uricase + tolerogenic nanoparticle', grp: 'Urate-lowering', route: 'Intravenous', codes: ['SEL-212'], inds: ['GOUT'], epmc: '("SEL-212" OR pegadricase OR ImmTOR)', intr: '"SEL-212" OR pegadricase', sponsor: 'sobi|swedish orphan|selecta|cartesian' },
        { id: 'pozdeutinurad', name: 'Pozdeutinurad (AR882)', short: 'Pozdeutinurad', company: 'Arthrosi', moa: 'URAT1 inhibitor', grp: 'Urate-lowering', route: 'Oral', codes: ['AR882'], inds: ['GOUT'], sponsor: 'arthrosi' },
        { id: 'nintedanib', name: 'Nintedanib', brand: 'OFEV', company: 'Boehringer Ingelheim', moa: 'Tyrosine kinase inhibitor (VEGFR/FGFR/PDGFR)', grp: 'Antifibrotic', route: 'Oral', inds: ['SSCILD'], epmc: '(nintedanib AND ("systemic sclerosis" OR scleroderma))', intr: 'nintedanib', sponsor: 'boehringer' }
      ],
      guides: [
        ['American College of Rheumatology', '"American College of Rheumatology"', 'https://rheumatology.org/', ['US']],
        ['Canadian Rheumatology Association', '"Canadian Rheumatology Association"', 'https://rheum.ca/', ['CA']],
        ['British Society for Rheumatology', '"British Society for Rheumatology"', 'https://www.rheumatology.org.uk/', ['GB']],
        ['EULAR', '(EULAR OR "European Alliance of Associations for Rheumatology")', 'https://www.eular.org/', ['EU']],
        ['Deutsche Gesellschaft für Rheumatologie', '("Deutsche Gesellschaft für Rheumatologie" OR DGRh)', 'https://dgrh.de/', ['DE']],
        ['Japan College of Rheumatology', '"Japan College of Rheumatology"', 'https://www.ryumachi-jp.com/', ['JP']],
        ['ASAS', '("Assessment of SpondyloArthritis international Society" OR ASAS)', 'https://www.asas-group.org/', ['*']],
        ['GRAPPA', '(GRAPPA OR "Group for Research and Assessment of Psoriasis and Psoriatic Arthritis")', 'https://www.grappanetwork.org/', ['*']],
        ['KDIGO', '(KDIGO OR "Kidney Disease: Improving Global Outcomes")', 'https://kdigo.org/', ['*']]
      ],
      congresses: [
        ['ACR Convergence', 'American College of Rheumatology Annual Meeting', 'https://rheumatology.org/'],
        ['EULAR', 'EULAR European Congress of Rheumatology', 'https://congress.eular.org/'],
        ['BSR', 'British Society for Rheumatology Annual Conference', 'https://www.rheumatology.org.uk/'],
        ['APLAR', 'Asia-Pacific League of Associations for Rheumatology Congress', 'https://www.aplar.org/'],
        ['JCR', 'Japan College of Rheumatology Annual Meeting', 'https://www.ryumachi-jp.com/'],
        ['GRAPPA', 'GRAPPA Annual Meeting', 'https://www.grappanetwork.org/'],
        ['SPARTAN', 'Spondyloarthritis Research and Treatment Network Annual Meeting', 'https://spartangroup.org/'],
        ['ASN Kidney Week', 'American Society of Nephrology Kidney Week', 'https://www.asn-online.org/']
      ],
      advocacy: [
        ['Arthritis Foundation', 'Patient advocacy', ['RA', 'PsA', 'AXSPA', 'GOUT'], 'https://www.arthritis.org'],
        ['Spondylitis Association of America', 'Patient advocacy', ['AXSPA'], 'https://spondylitis.org'],
        ['National Psoriasis Foundation', 'Patient advocacy', ['PsA'], 'https://www.psoriasis.org'],
        ['Lupus Foundation of America', 'Patient advocacy', ['SLE', 'LN'], 'https://www.lupus.org'],
        ['Lupus Research Alliance', 'Patient advocacy', ['SLE', 'LN'], 'https://www.lupusresearch.org'],
        ["Sjögren's Foundation", 'Patient advocacy', ['SJD'], 'https://www.sjogrens.org'],
        ['National Scleroderma Foundation', 'Patient advocacy', ['SSCILD'], 'https://scleroderma.org'],
        ['Vasculitis Foundation', 'Patient advocacy', ['GCA'], 'https://www.vasculitisfoundation.org'],
        ['Gout Education Society', 'Patient advocacy', ['GOUT'], 'https://gouteducation.org'],
        ['American College of Rheumatology', 'Professional society', ['*'], 'https://rheumatology.org']
      ],
      themes: [
        ['CAR-T and deep B-cell depletion', '("CAR-T" OR "CAR T" OR "chimeric antigen receptor" OR "T-cell engager" OR "immune reset")'],
        ['Difficult-to-treat RA', '("difficult-to-treat" OR "D2T" OR "multi-refractory")'],
        ['Treat-to-target and remission', '("treat-to-target" OR "treat to target" OR LLDAS OR DORIS OR "minimal disease activity")'],
        ['Glucocorticoid sparing', '("glucocorticoid-sparing" OR "steroid-sparing" OR "glucocorticoid taper*")'],
        ['JAK safety (MACE, VTE, malignancy)', '((JAK OR "Janus kinase") AND (MACE OR "venous thromboembolism" OR malignancy))'],
        ['Biosimilar switching', '(biosimilar* OR "non-medical switch*")'],
        ['Interferon, BAFF and CD40L pathways', '("type I interferon" OR BAFF OR "BAFF-R" OR CD40L OR BDCA2)'],
        ['Gout cardiovascular risk and urate targets', '(gout AND (cardiovascular OR "urate target" OR "flare prophylaxis"))'],
        ['Connective tissue disease ILD', '("interstitial lung disease" OR ILD OR "pulmonary fibrosis")'],
        ['Imaging and structural progression', '(MRI OR "radiographic progression" OR mSASSS OR mTSS OR sacroiliitis)']
      ],
      pros: ['HAQ-DI', 'FACIT-Fatigue', 'SF-36', 'BASDAI', 'BASFI', 'ASQoL', 'PsAID', 'RAPID3', 'ESSPRI', 'LupusQoL'],
      endpoints: [[/ACR ?20|ACR ?50|ACR ?70/i, 'ACR response'], [/DAS28/i, 'DAS28'], [/ASAS ?20|ASAS ?40/i, 'ASAS response'], [/ASDAS/i, 'ASDAS'], [/\bMDA\b|minimal disease activity/i, 'Minimal disease activity'], [/\bSRI(-| )?4\b|SLE Responder Index/i, 'SRI-4'], [/BICLA/i, 'BICLA'], [/renal response/i, 'Renal response'], [/ESSDAI/i, 'ESSDAI'], [/serum urate|serum uric acid|\bsUA\b/i, 'Serum urate'], [/sustained remission/i, 'Sustained remission'], [/\bFVC\b|forced vital capacity/i, 'FVC']],
      elig: [[/methotrexate|\bMTX\b/i, 'Methotrexate background'], [/inadequate response|TNF-?IR|intoleran/i, 'Prior inadequate response'], [/swollen joint|tender joint|\bSJC\b|\bTJC\b/i, 'Joint count threshold'], [/BASDAI/i, 'BASDAI threshold'], [/SLEDAI/i, 'SLEDAI threshold'], [/biopsy|class (III|IV|V)\b/i, 'Biopsy-proven lupus nephritis'], [/serum urate|uric acid/i, 'Serum urate threshold'], [/glucocorticoid|prednison/i, 'Glucocorticoid rules']],
      gaps: [
        ['d2t', 'Difficult-to-treat disease', '("difficult-to-treat" OR refractory OR "inadequate response")'],
        ['gc', 'Glucocorticoid sparing', '("glucocorticoid-sparing" OR "steroid-sparing" OR "glucocorticoid taper*")'],
        ['ild', 'Lung involvement', '("interstitial lung disease" OR ILD)'],
        ['cv', 'Cardiovascular risk', '(cardiovascular OR MACE OR "major adverse cardiovascular")']
      ],
      pops: []
    },
    {
      id: 'ID', name: 'Infectious diseases & vaccines', short: 'ID & vaccines',
      desc: 'HIV, viral hepatitis, respiratory viruses, transplant CMV, bacterial infections and vaccines',
      fedTerms: ['HIV', 'vaccines'],
      specialties: 'infectious|immunolog',
      inds: [
        { id: 'HIV', name: 'HIV-1 treatment', short: 'HIV', abbr: ['hiv', 'hiv-1'], syn: ['human immunodeficiency virus', 'antiretroviral therapy'], epmc: '("HIV-1" OR "HIV infection" OR "people with HIV" OR "people living with HIV")', ct: 'HIV', re: /\bHIV|human immunodeficiency/i, not: /pre-?exposure|\bPrEP\b|prevention/i, label: /treatment of HIV|HIV-1 infection/i, core: true },
        { id: 'PREP', name: 'HIV pre-exposure prophylaxis', short: 'HIV PrEP', abbr: ['prep'], syn: ['pre-exposure prophylaxis', 'hiv prevention'], epmc: '(("pre-exposure prophylaxis" OR PrEP) AND HIV)', ct: 'HIV pre-exposure prophylaxis', re: /pre-?exposure prophylaxis|\bPrEP\b|HIV prevention/i, label: /pre-?exposure prophylaxis|\bPrEP\b|reduce the risk of sexually acquired HIV/i },
        { id: 'RSV', name: 'Respiratory syncytial virus', short: 'RSV', abbr: ['rsv'], syn: ['respiratory syncytial virus', 'bronchiolitis'], epmc: '("respiratory syncytial virus" OR RSV)', ct: 'respiratory syncytial virus', re: /respiratory syncytial|\bRSV\b/i, label: /respiratory syncytial virus|\bRSV\b/i, core: true },
        { id: 'PNEU', name: 'Pneumococcal disease', short: 'pneumococcal disease', abbr: ['ipd'], syn: ['invasive pneumococcal disease', 'pneumococcal pneumonia', 'streptococcus pneumoniae'], epmc: '(pneumococcal OR "Streptococcus pneumoniae")', ct: 'pneumococcal infections', re: /pneumococ|streptococcus pneumoniae/i, label: /pneumococ|Streptococcus pneumoniae/i, core: true },
        { id: 'COVID', name: 'COVID-19', short: 'COVID-19', abbr: ['covid', 'sars-cov-2'], syn: ['coronavirus disease 2019'], epmc: '(COVID-19 OR "SARS-CoV-2")', ct: 'COVID-19', re: /covid|sars-?cov-?2/i, label: /COVID-19|SARS-CoV-2/i },
        { id: 'FLU', name: 'Influenza', short: 'influenza', abbr: ['flu'], syn: ['seasonal influenza'], epmc: '(influenza NOT "Haemophilus influenzae")', ct: 'influenza', re: /influenza(?!e)|\bflu\b/i, label: /influenza(?!e)/i },
        { id: 'HBV', name: 'Chronic hepatitis B / D', short: 'chronic hepatitis B and D', abbr: ['hbv', 'hdv', 'chb'], syn: ['hepatitis b', 'hepatitis d', 'hepatitis delta'], epmc: '("hepatitis B" OR "hepatitis D" OR "hepatitis delta")', ct: 'hepatitis B OR hepatitis D', re: /hepatitis ?(b|d|delta)\b|\bHBV\b|\bHDV\b/i, not: /vaccin/i, label: /hepatitis B|hepatitis delta|hepatitis D\b/i },
        { id: 'CMV', name: 'CMV in transplant', short: 'CMV in transplant recipients', abbr: ['cmv'], syn: ['cytomegalovirus'], epmc: '(cytomegalovirus AND transplant*)', ct: 'cytomegalovirus', re: /cytomegalovirus|\bCMV\b/i, label: /cytomegalovirus|\bCMV\b/i },
        { id: 'CDI', name: 'Clostridioides difficile infection', short: 'C. difficile infection', abbr: ['cdi', 'c diff'], syn: ['clostridium difficile', 'recurrent cdi'], epmc: '("Clostridioides difficile" OR "Clostridium difficile")', ct: 'clostridium difficile', re: /difficile|\bCDI\b/i, label: /difficile/i },
        { id: 'UTI', name: 'Urinary tract infections', short: 'urinary tract infection', abbr: ['uti', 'cuti', 'uuti'], syn: ['complicated urinary tract infection', 'pyelonephritis', 'cystitis'], epmc: '("urinary tract infection" OR pyelonephritis)', ct: 'urinary tract infection', re: /urinary tract infection|pyelonephritis|\bc?UTI\b|\buUTI\b/i, label: /urinary tract infection|pyelonephritis/i }
      ],
      assets: [
        { id: 'bictegravir', name: 'Bictegravir / emtricitabine / tenofovir alafenamide', short: 'Bictegravir (B/F/TAF)', brand: 'BIKTARVY', company: 'Gilead', moa: 'INSTI + NRTI single-tablet regimen', grp: 'Integrase inhibitor', route: 'Oral', inds: ['HIV'], epmc: '(bictegravir OR Biktarvy)', intr: 'bictegravir', sponsor: 'gilead' },
        { id: 'dtg3tc', name: 'Dolutegravir / lamivudine', short: 'DTG/3TC', brand: 'DOVATO', company: 'ViiV Healthcare', moa: 'INSTI + NRTI two-drug regimen', grp: 'Integrase inhibitor', route: 'Oral', inds: ['HIV'], epmc: '(Dovato OR "DTG/3TC" OR (dolutegravir AND lamivudine))', intr: '(dolutegravir AND lamivudine)', sponsor: 'viiv|glaxo|gsk' },
        { id: 'cabrpv', name: 'Cabotegravir + rilpivirine LA', short: 'CAB+RPV LA', brand: 'CABENUVA', company: 'ViiV Healthcare / Johnson & Johnson', moa: 'Long-acting INSTI + NNRTI injection', grp: 'Integrase inhibitor', route: 'Injectable', inds: ['HIV'], epmc: '(Cabenuva OR (cabotegravir AND rilpivirine))', intr: '(cabotegravir AND rilpivirine)', sponsor: 'viiv|glaxo|gsk|janssen' },
        { id: 'cabotegravir', name: 'Cabotegravir LA (PrEP)', short: 'Cabotegravir', brand: 'APRETUDE', company: 'ViiV Healthcare', moa: 'Long-acting INSTI injection', grp: 'Integrase inhibitor', route: 'Injectable', inds: ['PREP'], epmc: '(Apretude OR (cabotegravir AND (PrEP OR "pre-exposure prophylaxis")))', intr: 'cabotegravir', sponsor: 'viiv|glaxo|gsk' },
        { id: 'lenacapavir', name: 'Lenacapavir', brand: 'SUNLENCA', company: 'Gilead', moa: 'HIV-1 capsid inhibitor', grp: 'Capsid inhibitor', route: 'Injectable', codes: ['GS-6207'], inds: ['HIV'], sponsor: 'gilead' },
        { id: 'lenacapavirprep', name: 'Lenacapavir (PrEP)', short: 'Lenacapavir PrEP', brand: 'YEZTUGO', generic: 'lenacapavir', company: 'Gilead', moa: 'Twice-yearly capsid inhibitor', grp: 'Capsid inhibitor', route: 'Injectable', inds: ['PREP'], epmc: '(Yeztugo OR (lenacapavir AND (PrEP OR "pre-exposure prophylaxis" OR PURPOSE)))', intr: 'lenacapavir', sponsor: 'gilead' },
        { id: 'islatravirlenacapavir', name: 'Islatravir + lenacapavir', short: 'ISL/LEN', company: 'Gilead / Merck', moa: 'NRTTI + capsid inhibitor, once-weekly oral', grp: 'Capsid inhibitor', route: 'Oral', inds: ['HIV'], epmc: '(islatravir AND lenacapavir)', intr: '(islatravir AND lenacapavir)', sponsor: 'gilead|merck sharp' },
        { id: 'bepirovirsen', name: 'Bepirovirsen', company: 'GSK', moa: 'Antisense oligonucleotide (HBV RNA)', grp: 'Hepatitis B / D antiviral', route: 'Injectable', codes: ['GSK3228836'], inds: ['HBV'], sponsor: 'glaxo|gsk|ionis' },
        { id: 'bulevirtide', name: 'Bulevirtide', company: 'Gilead', moa: 'NTCP entry inhibitor (HDV)', grp: 'Hepatitis B / D antiviral', route: 'Injectable', codes: ['Myrcludex B'], inds: ['HBV'], sponsor: 'gilead|myr' },
        { id: 'tobevibart', name: 'Tobevibart + elebsiran', short: 'Tobevibart', company: 'Vir Biotechnology', moa: 'Anti-HBsAg mAb + HBV siRNA (HDV)', grp: 'Hepatitis B / D antiviral', route: 'Injectable', codes: ['VIR-3434', 'VIR-2218'], inds: ['HBV'], epmc: '(tobevibart OR elebsiran OR "VIR-3434" OR "VIR-2218")', intr: 'tobevibart OR elebsiran', sponsor: 'vir biotech' },
        { id: 'rsvpref3', name: 'RSV vaccine, adjuvanted (RSVPreF3 OA)', short: 'RSVPreF3 OA', brand: 'AREXVY', generic: 'respiratory syncytial virus vaccine, adjuvanted', company: 'GSK', moa: 'Adjuvanted prefusion F protein vaccine', grp: 'RSV vaccine', route: 'Injectable', inds: ['RSV'], epmc: '(Arexvy OR RSVPreF3)', intr: '(Arexvy OR RSVPreF3)', sponsor: 'glaxo|gsk' },
        { id: 'rsvpref', name: 'RSV prefusion F vaccine (RSVpreF)', short: 'RSVpreF', brand: 'ABRYSVO', generic: 'respiratory syncytial virus vaccine', company: 'Pfizer', moa: 'Bivalent prefusion F protein vaccine', grp: 'RSV vaccine', route: 'Injectable', inds: ['RSV'], epmc: '(Abrysvo OR RSVpreF)', intr: '(Abrysvo OR RSVpreF)', sponsor: 'pfizer' },
        { id: 'mrna1345', name: 'RSV mRNA vaccine (mRNA-1345)', short: 'mRNA-1345', brand: 'MRESVIA', generic: 'respiratory syncytial virus vaccine', company: 'Moderna', moa: 'mRNA prefusion F vaccine', grp: 'RSV vaccine', route: 'Injectable', codes: ['mRNA-1345'], inds: ['RSV'], epmc: '(mRESVIA OR "mRNA-1345")', intr: '"mRNA-1345" OR mRESVIA', sponsor: 'moderna' },
        { id: 'nirsevimab', name: 'Nirsevimab', brand: 'BEYFORTUS', company: 'Sanofi / AstraZeneca', moa: 'Long-acting anti-RSV F mAb', grp: 'RSV antibody', route: 'Injectable', codes: ['MEDI8897'], inds: ['RSV'], sponsor: 'sanofi|astrazeneca|medimmune' },
        { id: 'clesrovimab', name: 'Clesrovimab', brand: 'ENFLONSIA', company: 'Merck', moa: 'Long-acting anti-RSV F mAb', grp: 'RSV antibody', route: 'Injectable', codes: ['MK-1654'], inds: ['RSV'], sponsor: 'merck sharp' },
        { id: 'bnt162b2', name: 'COVID-19 vaccine, mRNA (BNT162b2)', short: 'BNT162b2', brand: 'COMIRNATY', generic: 'covid-19 vaccine, mrna', company: 'Pfizer / BioNTech', moa: 'mRNA spike vaccine', grp: 'COVID-19 / influenza vaccine', route: 'Injectable', codes: ['BNT162b2'], inds: ['COVID'], epmc: '(Comirnaty OR BNT162b2)', intr: 'BNT162b2 OR Comirnaty', sponsor: 'pfizer|biontech' },
        { id: 'mrna1273', name: 'COVID-19 vaccine, mRNA (mRNA-1273)', short: 'mRNA-1273', brand: 'SPIKEVAX', generic: 'covid-19 vaccine, mrna', company: 'Moderna', moa: 'mRNA spike vaccine', grp: 'COVID-19 / influenza vaccine', route: 'Injectable', codes: ['mRNA-1273'], inds: ['COVID'], epmc: '(Spikevax OR "mRNA-1273")', intr: '"mRNA-1273" OR Spikevax', sponsor: 'moderna' },
        { id: 'mrna1010', name: 'Influenza mRNA vaccine (mRNA-1010)', short: 'mRNA-1010', company: 'Moderna', moa: 'mRNA hemagglutinin vaccine', grp: 'COVID-19 / influenza vaccine', route: 'Injectable', codes: ['mRNA-1010'], inds: ['FLU'], epmc: '"mRNA-1010"', intr: '"mRNA-1010"', sponsor: 'moderna' },
        { id: 'nirmatrelvir', name: 'Nirmatrelvir / ritonavir', short: 'Nirmatrelvir', brand: 'PAXLOVID', company: 'Pfizer', moa: 'SARS-CoV-2 3CL protease inhibitor', grp: 'COVID-19 / influenza antiviral', route: 'Oral', codes: ['PF-07321332'], inds: ['COVID'], epmc: '(nirmatrelvir OR Paxlovid OR "PF-07321332")', sponsor: 'pfizer' },
        { id: 'ensitrelvir', name: 'Ensitrelvir', company: 'Shionogi', moa: 'SARS-CoV-2 3CL protease inhibitor', grp: 'COVID-19 / influenza antiviral', route: 'Oral', codes: ['S-217622'], inds: ['COVID'], sponsor: 'shionogi' },
        { id: 'baloxavir', name: 'Baloxavir marboxil', short: 'Baloxavir', brand: 'XOFLUZA', company: 'Genentech / Shionogi', moa: 'Cap-dependent endonuclease inhibitor', grp: 'COVID-19 / influenza antiviral', route: 'Oral', codes: ['S-033188'], inds: ['FLU'], sponsor: 'genentech|roche|hoffmann|shionogi' },
        { id: 'letermovir', name: 'Letermovir', brand: 'PREVYMIS', company: 'Merck', moa: 'CMV terminase complex inhibitor', grp: 'CMV antiviral', route: 'Oral', codes: ['MK-8228'], inds: ['CMV'], sponsor: 'merck sharp|aicuris' },
        { id: 'maribavir', name: 'Maribavir', brand: 'LIVTENCITY', company: 'Takeda', moa: 'CMV UL97 kinase inhibitor', grp: 'CMV antiviral', route: 'Oral', codes: ['TAK-620'], inds: ['CMV'], sponsor: 'takeda|shire' },
        { id: 'ser109', name: 'Fecal microbiota spores, live-brpk (SER-109)', short: 'SER-109', brand: 'VOWST', generic: 'fecal microbiota spores', company: 'Nestlé Health Science', moa: 'Purified Firmicutes spores', grp: 'Microbiome therapeutic', route: 'Oral', codes: ['SER-109'], inds: ['CDI'], epmc: '(Vowst OR "SER-109")', intr: '"SER-109" OR Vowst', sponsor: 'seres|nestl' },
        { id: 'fidaxomicin', name: 'Fidaxomicin', brand: 'DIFICID', company: 'Merck', moa: 'Narrow-spectrum macrocyclic antibiotic', grp: 'Antibacterial', route: 'Oral', inds: ['CDI'], sponsor: 'merck sharp|optimer|cubist|astellas' },
        { id: 'gepotidacin', name: 'Gepotidacin', brand: 'BLUJEPA', company: 'GSK', moa: 'Triazaacenaphthylene topoisomerase inhibitor', grp: 'Antibacterial', route: 'Oral', codes: ['GSK2140944'], inds: ['UTI'], sponsor: 'glaxo|gsk' },
        { id: 'cefepimeenmetazobactam', name: 'Cefepime / enmetazobactam', short: 'Cefepime-enmetazobactam', brand: 'EXBLIFEP', generic: 'enmetazobactam', company: 'Allecra', moa: 'Cephalosporin + ESBL β-lactamase inhibitor', grp: 'Antibacterial', route: 'Intravenous', inds: ['UTI'], epmc: 'enmetazobactam', intr: 'enmetazobactam', sponsor: 'allecra' },
        { id: 'pcv20', name: 'Pneumococcal 20-valent conjugate vaccine (PCV20)', short: 'PCV20', brand: 'PREVNAR 20', generic: 'pneumococcal 20-valent conjugate vaccine', company: 'Pfizer', moa: '20-valent CRM197 conjugate vaccine', grp: 'Pneumococcal vaccine', route: 'Injectable', codes: ['PCV20'], inds: ['PNEU'], epmc: '(PCV20 OR "Prevnar 20" OR "Prevenar 20" OR "20-valent pneumococcal conjugate")', intr: '(PCV20 OR "20-valent pneumococcal conjugate vaccine")', sponsor: 'pfizer' },
        { id: 'v116', name: 'Pneumococcal 21-valent conjugate vaccine (V116)', short: 'V116', brand: 'CAPVAXIVE', generic: 'pneumococcal 21-valent conjugate vaccine', company: 'Merck', moa: '21-valent adult-focused conjugate vaccine', grp: 'Pneumococcal vaccine', route: 'Injectable', codes: ['V116'], inds: ['PNEU'], epmc: '(V116 OR Capvaxive OR "21-valent pneumococcal conjugate")', intr: '(V116 OR Capvaxive)', sponsor: 'merck sharp' },
        { id: 'vax31', name: 'VAX-31', company: 'Vaxcyte', moa: '31-valent site-specific conjugate vaccine', grp: 'Pneumococcal vaccine', route: 'Injectable', codes: ['VAX-31'], inds: ['PNEU'], epmc: '"VAX-31"', intr: '"VAX-31"', sponsor: 'vaxcyte' }
      ],
      guides: [
        ['IDSA', '"Infectious Diseases Society of America"', 'https://www.idsociety.org/', ['US']],
        ['DHHS Antiretroviral Guidelines', '("Panel on Antiretroviral Guidelines" OR "DHHS guidelines")', 'https://clinicalinfo.hiv.gov/en/guidelines', ['US']],
        ['IAS-USA', '"IAS-USA"', 'https://www.iasusa.org/', ['US']],
        ['CDC ACIP', '"Advisory Committee on Immunization Practices"', 'https://www.cdc.gov/acip/', ['US']],
        ['AASLD', '"American Association for the Study of Liver Diseases"', 'https://www.aasld.org/', ['US']],
        ['BHIVA', '"British HIV Association"', 'https://www.bhiva.org/', ['GB']],
        ['EACS', '"European AIDS Clinical Society"', 'https://www.eacsociety.org/', ['EU']],
        ['ESCMID', '(ESCMID OR "European Society of Clinical Microbiology and Infectious Diseases")', 'https://www.escmid.org/', ['EU']],
        ['EASL', '"European Association for the Study of the Liver"', 'https://easl.eu/', ['EU']],
        ['WHO', '("World Health Organization" AND guideline*)', 'https://www.who.int/publications/who-guidelines', ['*']]
      ],
      congresses: [
        ['CROI', 'Conference on Retroviruses and Opportunistic Infections', 'https://www.croiconference.org/'],
        ['IAS / AIDS', 'International AIDS Society conferences', 'https://www.iasociety.org/'],
        ['HIV Glasgow', 'International Congress on Drug Therapy in HIV Infection', 'https://hivglasgow.org/'],
        ['IDWeek', 'IDWeek', 'https://idweek.org/'],
        ['ESCMID Global', 'ESCMID Global Congress', 'https://www.escmid.org/'],
        ['The Liver Meeting', 'AASLD The Liver Meeting', 'https://www.aasld.org/'],
        ['EASL Congress', 'EASL Congress', 'https://easl.eu/'],
        ['ReSViNET', 'RSV conference (ReSViNET)', 'https://resvinet.org/'],
        ['Options', 'Options for the Control of Influenza (ISIRV)', 'https://isirv.org/'],
        ['ASM Microbe', 'American Society for Microbiology ASM Microbe', 'https://asm.org/']
      ],
      advocacy: [
        ['AVAC', 'Patient advocacy', ['PREP', 'HIV'], 'https://avac.org'],
        ['The Well Project', 'Patient advocacy', ['HIV', 'PREP'], 'https://www.thewellproject.org'],
        ['Hepatitis B Foundation', 'Patient advocacy', ['HBV'], 'https://www.hepb.org'],
        ['Peggy Lillis Foundation', 'Patient advocacy', ['CDI'], 'https://peggyfoundation.org'],
        ['National Foundation for Infectious Diseases', 'Professional society', ['*'], 'https://www.nfid.org'],
        ['Immunize.org', 'Professional society', ['RSV', 'PNEU', 'COVID', 'FLU'], 'https://www.immunize.org'],
        ['HIV Medicine Association', 'Professional society', ['HIV', 'PREP'], 'https://www.hivma.org'],
        ['Infectious Diseases Society of America', 'Professional society', ['*'], 'https://www.idsociety.org']
      ],
      themes: [
        ['Long-acting antiretrovirals', '("long-acting" AND (antiretroviral OR cabotegravir OR lenacapavir OR islatravir))'],
        ['PrEP uptake and persistence', '((PrEP OR "pre-exposure prophylaxis") AND (uptake OR persistence OR adherence OR "status-neutral"))'],
        ['HBV functional cure', '("functional cure" OR "HBsAg loss" OR "HBsAg seroclearance")'],
        ['Infant and maternal RSV protection', '((RSV OR "respiratory syncytial") AND (maternal OR infant* OR nirsevimab OR clesrovimab))'],
        ['Vaccine effectiveness and co-administration', '("vaccine effectiveness" OR coadministration OR "co-administration")'],
        ['Combination respiratory vaccines', '("combination vaccine" OR "influenza and COVID-19" OR "flu/COVID")'],
        ['Higher-valency pneumococcal vaccines', '("20-valent" OR "21-valent" OR "31-valent" OR "serotype replacement")'],
        ['Antimicrobial resistance', '("antimicrobial resistance" OR "carbapenem-resistant" OR ESBL OR "multidrug-resistant")'],
        ['Microbiome restoration', '(microbiome OR "fecal microbiota" OR "faecal microbiota")'],
        ['Antiviral resistance', '("drug resistance" AND (integrase OR capsid OR letermovir OR maribavir OR baloxavir))']
      ],
      pros: ['HIVTSQ', 'HIV-SI', 'PIN', 'FLU-PRO', 'RiiQ', 'EQ-5D', 'SF-12', 'WPAI'],
      endpoints: [[/incidence of HIV|HIV incidence|seroconver/i, 'HIV incidence'], [/HIV-1 RNA|viral load|virologic/i, 'Virologic suppression'], [/HDV RNA/i, 'HDV RNA response'], [/HBsAg|HBV DNA/i, 'HBsAg loss / HBV DNA'], [/geometric mean|\bGMT\b|\bGMC\b|neutrali[sz]|opsonophagocytic|\bOPA\b/i, 'Immunogenicity'], [/vaccine efficacy/i, 'Vaccine efficacy'], [/lower respiratory tract|\bLRTD\b|medically attended/i, 'RSV lower respiratory disease'], [/time to (alleviation|resolution|sustained)|symptom (alleviation|resolution)/i, 'Time to symptom resolution'], [/hospitali[sz]/i, 'Hospitalisation or death'], [/clinically significant CMV|CMV infection|viremia clearance|viraemia clearance/i, 'CMV infection / clearance'], [/recurrence/i, 'CDI recurrence'], [/clinical cure|microbiological (eradication|response)|therapeutic response|composite (cure|response)/i, 'Clinical / microbiological cure']],
      elig: [[/HIV-1 RNA|viral load|virologically suppressed/i, 'Viral load criteria'], [/CD4/i, 'CD4 threshold'], [/treatment-na[iï]ve|ART-na[iï]ve|antiretroviral-na[iï]ve/i, 'Treatment-naive'], [/HBsAg|HBV DNA/i, 'HBV status'], [/transplant/i, 'Transplant recipients'], [/60 years|65 years|older adults/i, 'Older-adult age threshold'], [/symptom onset|within 48 hours/i, 'Time from symptom onset']],
      gaps: [
        ['res', 'Resistance', '(resistance OR "resistance-associated" OR "drug-resistant")'],
        ['coadmin', 'Vaccine co-administration', '(coadministration OR "co-administration" OR "concomitant administration")'],
        ['durab', 'Durability of protection', '(durability OR waning OR revaccination OR booster)'],
        ['kp', 'Key populations and equity', '("key populations" OR "men who have sex with men" OR "cisgender women" OR transgender OR "people who inject drugs")']
      ],
      pops: [
        ['tx', 'Transplant recipients', '(transplant* OR "hematopoietic stem cell" OR "solid organ")', 'transplant*[tiab] OR "solid organ"[tiab] OR "hematopoietic stem cell"[tiab]'],
        ['kp', 'Key populations for HIV prevention', '("cisgender women" OR transgender OR "men who have sex with men" OR "people who inject drugs")', '"cisgender women"[tiab] OR transgender[tiab] OR "men who have sex with men"[tiab] OR "people who inject drugs"[tiab]']
      ]
    },
    {
      id: 'WH', name: "Women's health & urology", short: "Women's health",
      desc: 'Gynecology, menopause, contraception, obstetrics and functional urology',
      fedTerms: ['contraception', 'menopause'],
      specialties: 'obstetric|gynecolog|urolog|reproductive',
      inds: [
        { id: 'VMS', name: 'Menopausal vasomotor symptoms', short: 'vasomotor symptoms', abbr: ['vms'], syn: ['hot flashes', 'hot flushes', 'menopause'], epmc: '("vasomotor symptoms" OR "hot flashes" OR "hot flushes")', ct: 'hot flashes', re: /vasomotor|hot flash|hot flush/i, label: /vasomotor symptoms/i, core: true },
        { id: 'OAB', name: 'Overactive bladder', short: 'overactive bladder', abbr: ['oab'], syn: ['urgency urinary incontinence', 'detrusor overactivity'], epmc: '("overactive bladder" OR "urgency urinary incontinence")', ct: 'overactive bladder', re: /overactive bladder|urg(e|ency) (urinary )?incontinence|detrusor overactivity/i, label: /overactive bladder|detrusor overactivity/i, core: true },
        { id: 'ENDO', name: 'Endometriosis', short: 'endometriosis', abbr: [], syn: ['endometriosis-associated pain'], epmc: '(endometriosis)', ct: 'endometriosis', re: /endometrio(sis|ma)/i, label: /endometriosis/i, core: true },
        { id: 'UF', name: 'Uterine fibroids', short: 'uterine fibroids', abbr: ['uf'], syn: ['leiomyoma', 'heavy menstrual bleeding'], epmc: '("uterine fibroids" OR leiomyoma OR "uterine myoma")', ct: 'uterine fibroids', re: /fibroid|leiomyoma|myoma/i, label: /uterine (fibroids|leiomyomas)/i },
        { id: 'CONTRA', name: 'Contraception', short: 'contraception', abbr: [], syn: ['birth control', 'contraceptive'], epmc: '(contraception OR contraceptive)', ct: 'contraception', re: /contracep/i, label: /prevent(ion of)? pregnancy|contracep/i },
        { id: 'BPH', name: 'Benign prostatic hyperplasia', short: 'BPH', abbr: ['bph', 'luts'], syn: ['lower urinary tract symptoms', 'enlarged prostate'], epmc: '("benign prostatic hyperplasia" OR "lower urinary tract symptoms")', ct: 'benign prostatic hyperplasia', re: /prostatic hyperplasia|\bBPH\b|lower urinary tract symptom|\bLUTS\b/i, label: /benign prostatic hyperplasia|\bBPH\b/i },
        { id: 'PPH', name: 'Postpartum hemorrhage', short: 'postpartum hemorrhage', abbr: ['pph'], syn: ['postpartum haemorrhage', 'obstetric hemorrhage'], epmc: '("postpartum hemorrhage" OR "postpartum haemorrhage")', ct: 'postpartum hemorrhage', re: /post-?partum (ha?emorrhage|bleeding)|obstetric ha?emorrhage/i, label: /postpartum (bleeding|hemorrhage)/i }
      ],
      assets: [
        { id: 'fezolinetant', name: 'Fezolinetant', brand: 'VEOZAH', company: 'Astellas', moa: 'NK3 receptor antagonist', grp: 'NK3 antagonist', route: 'Oral', codes: ['ESN364'], inds: ['VMS'], sponsor: 'astellas|ogeda' },
        { id: 'elinzanetant', name: 'Elinzanetant', brand: 'LYNKUET', company: 'Bayer', moa: 'NK1/NK3 receptor antagonist', grp: 'NK3 antagonist', route: 'Oral', codes: ['NT-814'], inds: ['VMS'], sponsor: 'bayer|nerre|kandy' },
        { id: 'bazedoxifene', name: 'Conjugated estrogens / bazedoxifene', short: 'CE/BZA', brand: 'DUAVEE', generic: 'bazedoxifene', company: 'Pfizer', moa: 'Estrogens + SERM (TSEC)', grp: 'Hormone therapy', route: 'Oral', inds: ['VMS'], epmc: '(Duavee OR (bazedoxifene AND "conjugated estrogens"))', intr: 'bazedoxifene', sponsor: 'pfizer|wyeth' },
        { id: 'estradiolprogesterone', name: 'Estradiol / progesterone', short: 'E2/P4', brand: 'BIJUVA', generic: 'estradiol and progesterone', company: 'Mayne Pharma', moa: 'Bioidentical estradiol + progesterone capsule', grp: 'Hormone therapy', route: 'Oral', codes: ['TX-001HR'], inds: ['VMS'], epmc: '(Bijuva OR "TX-001HR")', intr: '"TX-001HR" OR Bijuva', sponsor: 'therapeuticsmd|mayne' },
        { id: 'mirabegron', name: 'Mirabegron', brand: 'MYRBETRIQ', company: 'Astellas', moa: 'β3-adrenergic agonist', grp: 'Beta-3 agonist', route: 'Oral', codes: ['YM178'], inds: ['OAB'], sponsor: 'astellas' },
        { id: 'vibegron', name: 'Vibegron', brand: 'GEMTESA', company: 'Sumitomo Pharma', moa: 'β3-adrenergic agonist', grp: 'Beta-3 agonist', route: 'Oral', codes: ['MK-4618', 'URO-901', 'KRP-114V'], inds: ['OAB', 'BPH'], sponsor: 'urovant|sumitomo|kyorin' },
        { id: 'solifenacin', name: 'Solifenacin', brand: 'VESICARE', company: 'Astellas', moa: 'Antimuscarinic (M3)', grp: 'Antimuscarinic', route: 'Oral', inds: ['OAB'], sponsor: 'astellas' },
        { id: 'onabotulinumtoxina', name: 'OnabotulinumtoxinA', brand: 'BOTOX', generic: 'onabotulinumtoxinA', company: 'AbbVie', moa: 'Botulinum toxin type A (intradetrusor)', grp: 'Botulinum toxin', route: 'Injectable', inds: ['OAB'], epmc: '(onabotulinumtoxinA AND (bladder OR detrusor OR incontinence))', intr: 'onabotulinumtoxinA OR Botox', sponsor: 'allergan|abbvie' },
        { id: 'elagolix', name: 'Elagolix', brand: 'ORILISSA', company: 'AbbVie', moa: 'Oral GnRH antagonist', grp: 'GnRH antagonist', route: 'Oral', inds: ['ENDO'], sponsor: 'abbvie|neurocrine' },
        { id: 'elagolixe2neta', name: 'Elagolix / estradiol / norethindrone acetate', short: 'Elagolix add-back', brand: 'ORIAHNN', company: 'AbbVie', moa: 'GnRH antagonist + hormonal add-back', grp: 'GnRH antagonist', route: 'Oral', inds: ['UF'], epmc: '(Oriahnn OR (elagolix AND ("add-back" OR fibroid* OR leiomyoma*)))', intr: 'elagolix', sponsor: 'abbvie' },
        { id: 'relugolixct', name: 'Relugolix / estradiol / norethindrone acetate', short: 'Relugolix CT', brand: 'MYFEMBREE', generic: 'relugolix, estradiol', company: 'Sumitomo Pharma', moa: 'GnRH antagonist + hormonal add-back', grp: 'GnRH antagonist', route: 'Oral', inds: ['UF', 'ENDO'], epmc: '(Myfembree OR "relugolix combination therapy" OR (relugolix AND (endometriosis OR fibroid* OR leiomyoma*)))', intr: 'relugolix', sponsor: 'myovant|sumitomo' },
        { id: 'linzagolix', name: 'Linzagolix', company: 'Kissei / Theramex', moa: 'Oral GnRH antagonist', grp: 'GnRH antagonist', route: 'Oral', codes: ['OBE2109', 'KLH-2109'], inds: ['UF', 'ENDO'], sponsor: 'obseva|kissei|theramex' },
        { id: 'drospirenone', name: 'Drospirenone (progestin-only pill)', short: 'Drospirenone', brand: 'SLYND', company: 'Exeltis', moa: 'Progestin-only contraceptive (4 mg)', grp: 'Hormonal contraceptive', route: 'Oral', inds: ['CONTRA'], epmc: '(Slynd OR "drospirenone-only" OR "drospirenone 4 mg")', intr: 'drospirenone', sponsor: 'exeltis|chemo research|insud' },
        { id: 'estetrol', name: 'Estetrol / drospirenone', brand: 'NEXTSTELLIS', company: 'Mayne Pharma', moa: 'Native estrogen (E4) + progestin COC', grp: 'Hormonal contraceptive', route: 'Oral', inds: ['CONTRA'], epmc: '(Nextstellis OR Drovelis OR (estetrol AND drospirenone))', intr: 'estetrol', sponsor: 'mithra|mayne|estetra' },
        { id: 'segesterone', name: 'Segesterone acetate / ethinyl estradiol', short: 'Segesterone', brand: 'ANNOVERA', company: 'Mayne Pharma', moa: 'One-year contraceptive vaginal system', grp: 'Hormonal contraceptive', route: 'Vaginal', inds: ['CONTRA'], epmc: '(segesterone OR Annovera OR Nestorone)', intr: 'segesterone OR Nestorone', sponsor: 'population council|therapeuticsmd|mayne' },
        { id: 'norgestrel', name: 'Norgestrel (OTC)', short: 'Opill (norgestrel)', brand: 'OPILL', company: 'Perrigo', moa: 'Over-the-counter progestin-only pill', grp: 'Hormonal contraceptive', route: 'Oral', inds: ['CONTRA'], epmc: '(Opill OR (norgestrel AND ("over-the-counter" OR OTC OR "progestin-only")))', intr: 'norgestrel', sponsor: 'hra pharma|perrigo' },
        { id: 'tadalafil', name: 'Tadalafil', brand: 'CIALIS', company: 'Lilly', moa: 'PDE5 inhibitor', grp: 'PDE5', route: 'Oral', inds: ['BPH'], epmc: '(tadalafil AND ("benign prostatic" OR BPH OR "lower urinary tract"))', intr: 'tadalafil', sponsor: 'lilly|icos' },
        { id: 'tamsulosin', name: 'Tamsulosin', brand: 'FLOMAX', company: 'Boehringer Ingelheim', moa: 'α1A-adrenergic antagonist', grp: 'Alpha-blocker / 5-ARI', route: 'Oral', inds: ['BPH'], sponsor: 'boehringer|astellas' },
        { id: 'finasteride', name: 'Finasteride', brand: 'PROSCAR', company: 'Organon', moa: '5α-reductase inhibitor', grp: 'Alpha-blocker / 5-ARI', route: 'Oral', inds: ['BPH'], epmc: '(finasteride AND ("benign prostatic" OR BPH OR "lower urinary tract"))', intr: 'finasteride', sponsor: 'merck sharp|organon' },
        { id: 'oxytocin', name: 'Oxytocin', brand: 'PITOCIN', company: 'Par Pharmaceutical', moa: 'Oxytocin receptor agonist', grp: 'Uterotonic', route: 'Intravenous', inds: ['PPH'], epmc: '(oxytocin AND ("postpartum haemorrhage" OR "postpartum hemorrhage" OR "third stage of labour" OR "third stage of labor"))', intr: 'oxytocin', sponsor: 'par pharm' },
        { id: 'carbetocin', name: 'Carbetocin', company: 'Ferring', moa: 'Heat-stable oxytocin analogue', grp: 'Uterotonic', route: 'Injectable', inds: ['PPH'], sponsor: 'ferring' }
      ],
      guides: [
        ['ACOG', '("American College of Obstetricians and Gynecologists" OR ACOG)', 'https://www.acog.org/', ['US']],
        ['The Menopause Society', '("The Menopause Society" OR "North American Menopause Society")', 'https://menopause.org/', ['US']],
        ['American Urological Association', '"American Urological Association"', 'https://www.auanet.org/', ['US']],
        ['CDC contraception guidance (US MEC / SPR)', '("Medical Eligibility Criteria for Contraceptive Use" OR "US MEC")', 'https://www.cdc.gov/contraception/', ['US']],
        ['SOGC', '("Society of Obstetricians and Gynaecologists of Canada" OR SOGC)', 'https://www.sogc.org/', ['CA']],
        ['RCOG', '"Royal College of Obstetricians and Gynaecologists"', 'https://www.rcog.org.uk/', ['GB']],
        ['ESHRE', '(ESHRE OR "European Society of Human Reproduction and Embryology")', 'https://www.eshre.eu/', ['EU']],
        ['European Association of Urology', '"European Association of Urology"', 'https://uroweb.org/', ['EU']],
        ['International Menopause Society', '"International Menopause Society"', 'https://www.imsociety.org/', ['*']],
        ['FIGO', '(FIGO OR "International Federation of Gynecology and Obstetrics")', 'https://www.figo.org/', ['*']]
      ],
      congresses: [
        ['ACOG', 'ACOG Annual Clinical & Scientific Meeting', 'https://www.acog.org/'],
        ['The Menopause Society', 'The Menopause Society Annual Meeting', 'https://menopause.org/'],
        ['AUA', 'American Urological Association Annual Meeting', 'https://www.auanet.org/'],
        ['EAU', 'European Association of Urology Congress', 'https://uroweb.org/'],
        ['ICS', 'International Continence Society Annual Meeting', 'https://www.ics.org/'],
        ['SUFU', 'Society of Urodynamics, Female Pelvic Medicine & Urogenital Reconstruction', 'https://sufuorg.com/'],
        ['ESHRE', 'ESHRE Annual Meeting', 'https://www.eshre.eu/'],
        ['ASRM', 'American Society for Reproductive Medicine Scientific Congress', 'https://www.asrm.org/'],
        ['SMFM', 'Society for Maternal-Fetal Medicine Pregnancy Meeting', 'https://www.smfm.org/'],
        ['FIGO', 'FIGO World Congress', 'https://www.figo.org/']
      ],
      advocacy: [
        ['Endometriosis Foundation of America', 'Patient advocacy', ['ENDO'], 'https://www.endofound.org'],
        ['The White Dress Project', 'Patient advocacy', ['UF'], 'https://www.thewhitedressproject.org'],
        ['Urology Care Foundation', 'Patient advocacy', ['OAB', 'BPH'], 'https://www.urologyhealth.org'],
        ['National Association For Continence', 'Patient advocacy', ['OAB'], 'https://nafc.org'],
        ['Power to Decide', 'Patient advocacy', ['CONTRA'], 'https://powertodecide.org'],
        ['The Menopause Society', 'Professional society', ['VMS'], 'https://menopause.org'],
        ['ACOG', 'Professional society', ['*'], 'https://www.acog.org']
      ],
      themes: [
        ['Non-hormonal VMS therapy', '(fezolinetant OR elinzanetant OR neurokinin OR "non-hormonal")'],
        ['VMS in breast cancer survivors', '("breast cancer" AND (vasomotor OR "hot flash*" OR "hot flush*"))'],
        ['Sleep and menopause', '(menopaus* AND (sleep OR insomnia))'],
        ['Bone density on GnRH antagonists', '("bone mineral density" AND (GnRH OR elagolix OR relugolix OR linzagolix))'],
        ['Endometriosis diagnostic delay', '("diagnostic delay" OR "delayed diagnosis" OR "non-invasive diagnosis")'],
        ['Anticholinergic burden and cognition', '(anticholinergic AND (cognition OR cognitive OR dementia))'],
        ['OTC and pharmacy access to contraception', '("over-the-counter" OR "pharmacist-prescribed" OR telehealth)'],
        ['Fertility and pregnancy outcomes', '("fertility preservation" OR "pregnancy outcomes" OR "time to pregnancy")'],
        ['Heat-stable uterotonics and PPH bundles', '(carbetocin OR "tranexamic acid" OR "PPH bundle" OR "E-MOTIVE")'],
        ['Minimally invasive BPH procedures', '(Urolift OR Rezum OR "prostatic urethral lift" OR "water vapor thermal")']
      ],
      pros: ['MENQOL', 'PROMIS SD SF 8b', 'EHP-30', 'EHP-5', 'UFS-QOL', 'OAB-q', 'PPBC', 'IPSS'],
      endpoints: [[/frequency of (moderate|severe|moderate to severe) (vasomotor|hot flash|hot flush)|(vasomotor|hot flash|hot flush)\w* frequency/i, 'VMS frequency'], [/severity of (vasomotor|hot flash|hot flush)|(vasomotor|hot flash|hot flush)\w* severity/i, 'VMS severity'], [/menstrual blood loss|\bMBL\b|alkaline hematin/i, 'Menstrual blood loss'], [/dysmenorrh|pelvic pain|\bNMPP\b/i, 'Pelvic pain / dysmenorrhea'], [/micturition/i, 'Micturitions'], [/incontinence episode|urgency episode/i, 'Incontinence / urgency episodes'], [/\bIPSS\b|prostate symptom score/i, 'IPSS'], [/Qmax|peak (urinary )?flow/i, 'Peak flow (Qmax)'], [/Pearl Index/i, 'Pearl Index'], [/blood loss|post-?partum ha?emorrhage/i, 'PPH / blood loss'], [/bone mineral density|\bBMD\b/i, 'Bone mineral density']],
      elig: [[/hot flash|hot flush|vasomotor/i, 'Minimum VMS frequency'], [/postmenopaus|amenorrh/i, 'Menopausal status'], [/surgically|laparoscop/i, 'Surgically confirmed endometriosis'], [/fibroid|\bMBL\b|menstrual blood loss/i, 'Fibroid confirmation / MBL threshold'], [/micturition|urgency/i, 'OAB symptom thresholds'], [/\bIPSS\b|prostate volume|\bPSA\b/i, 'IPSS / prostate criteria'], [/body mass index|\bBMI\b/i, 'BMI limits']],
      gaps: [
        ['bone', 'Bone health', '("bone mineral density" OR BMD OR osteopor*)'],
        ['bmi', 'Higher BMI', '("body mass index" OR obesity OR obese)'],
        ['race', 'Race and ethnicity', '("Black women" OR "African American" OR Hispanic OR race OR ethnicity)'],
        ['cog', 'Cognition and anticholinergic burden', '(anticholinergic AND (cognition OR cognitive OR dementia))']
      ],
      pops: [
        ['bcs', 'Breast cancer survivors', '("breast cancer" AND (survivor* OR tamoxifen OR "aromatase inhibitor*"))', '"breast cancer"[tiab] AND (survivor*[tiab] OR tamoxifen[tiab] OR "aromatase inhibitor*"[tiab])'],
        ['peri', 'Perimenopausal women', '(perimenopaus* OR "menopausal transition")', 'perimenopaus*[tiab] OR "menopausal transition"[tiab]']
      ]
    }
  ];

  /* Added to every therapeutic area. */
  var GENERIC = {
    themes: [
      ['Real-world evidence', '("real-world" OR "real world" OR claims OR registry OR "electronic health record")'],
      ['Long-term safety', '(("long-term" OR "long term" OR "52-week" OR "52 weeks") AND safety)'],
      ['Head-to-head and network meta-analyses', '("head-to-head" OR "network meta-analysis" OR "indirect comparison" OR "comparative effectiveness")'],
      ['Patient-reported outcomes', '("patient-reported" OR "quality of life" OR "treatment satisfaction")'],
      ['Economics and access', '("cost-effectiveness" OR "budget impact" OR "prior authorization" OR adherence OR persistence)']
    ],
    gapsBefore: [
      ['pediatric', 'Pediatric', '(pediatric OR paediatric OR children OR child OR infant* OR adolescent*)'],
      ['longterm', 'Long-term safety', '(("long-term" OR "long term" OR "52 weeks" OR "52-week" OR extension) AND safety)'],
      ['h2h', 'Head-to-head and comparative', '("head-to-head" OR "network meta-analysis" OR "comparative effectiveness" OR "indirect comparison")']
    ],
    gapsAfter: [
      ['rwe', 'Real-world evidence', '("real-world" OR "real world" OR retrospective OR claims OR registry OR "routine practice")'],
      ['econ', 'Economics', '("cost-effectiveness" OR "cost effectiveness" OR economic OR "budget impact" OR costs)']
    ],
    endpoints: [[/adverse|safety|TEAE|tolerab/i, 'Safety (TEAEs)'], [/pharmacokinetic|plasma|concentration|\bAUC\b|Cmax/i, 'Pharmacokinetics'], [/quality of life|QoL/i, 'Quality of life']],
    elig: [[/washout/i, 'Washout of prior therapy'], [/inadequate response|failed|refractory|intoleran/i, 'Inadequate response to prior therapy'], [/pregnan/i, 'Pregnancy excluded'], [/biologic/i, 'Prior biologic rules'], [/infection/i, 'Active infection excluded'], [/malignan/i, 'Malignancy history excluded'], [/months|years? of age/i, 'Age band stated']],
    pros: ['EQ-5D', 'SF-36', 'PGI-C', 'PGI-S', 'WPAI'],
    pops: [
      ['ped', 'Pediatrics', '(child* OR pediatric OR paediatric OR infant* OR adolescent*)', '"child"[mh] OR "infant"[mh] OR "adolescent"[mh] OR pediatric*[tiab] OR paediatric*[tiab] OR child*[tiab]', 'pediatric'],
      ['preg', 'Pregnancy & lactation', '(pregnan* OR lactation OR breastfeed*)', '"pregnancy"[mh] OR "lactation"[mh] OR pregnan*[tiab] OR breastfeed*[tiab]', 'pregnancy'],
      ['older', 'Older adults', '(elderly OR "older adults" OR geriatric)', '"aged"[mh] OR elderly[tiab] OR "older adults"[tiab]', 'geriatric'],
      ['hep', 'Hepatic or renal impairment', '(hepatic OR renal OR "liver impairment" OR "kidney")', '"liver diseases"[mh] OR "renal insufficiency"[mh] OR hepatic[tiab] OR renal[tiab]', 'specific'],
      ['immuno', 'Immunocompromised', '(immunocompromised OR immunosuppress*)', '"immunocompromised host"[mh] OR immunocompromised[tiab]', 'warnings']
    ]
  };
  var ROUTES = ['Oral', 'Injectable', 'Intravenous', 'Topical', 'Inhaled', 'Intranasal', 'Intravitreal', 'Ophthalmic', 'Intrathecal', 'Vaginal', 'Transdermal', 'Other'];

  /* ---------- Helpers ---------- */
  function qt(s) { s = String(s); return /[\s\-\/+,&]/.test(s) ? '"' + s.replace(/"/g, '') + '"' : s; }
  function uniq(a) { var o = [], seen = {}; a.forEach(function (x) { if (x && !seen[x]) { seen[x] = 1; o.push(x); } }); return o; }
  function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  /* Fill the defaults an entry leaves out: generic name, queries and the lead-sponsor pattern. */
  function asset(a) {
    var o = {}; Object.keys(a).forEach(function (k) { o[k] = a[k]; });
    o.short = a.short || a.name;
    o.generic = String(a.generic || a.name.replace(/\s*\([^)]*\)\s*$/, '')).toLowerCase();
    o.codes = a.codes || []; o.inds = a.inds || []; o.route = a.route || 'Other'; o.grp = a.grp || 'Other';
    var names = uniq([o.generic].concat(o.codes));
    o.epmc = a.epmc || '(' + names.map(qt).join(' OR ') + ')';
    o.intr = a.intr || names.map(qt).join(' OR ');
    o.sponsor = a.sponsor || uniq(String(a.company || '').split('/').map(function (c) { return (c.trim().split(/[\s&,.]+/)[0] || '').toLowerCase(); })).map(escRe).join('|') || '.';
    return o;
  }
  function ta(id) { for (var i = 0; i < TAS.length; i++) if (TAS[i].id === id) return TAS[i]; return TAS[0]; }
  /* The default watchlist for a therapeutic area: every indication (the catalog's key ones as core, the rest as watch),
     every asset, no own product. A stored watchlist without 'core' uses the catalog's key flags too. */
  function defaultWatch(t) { return { scope: t.inds.map(function (i) { return i.id; }), assets: t.assets.map(function (a) { return a.id; }), ours: [], custom: [] }; }
  /* Europe PMC query limited to titles and abstracts. */
  function titleAbs(q) { return String(q).replace(/"[^"]*"|[^\s()"]+/g, function (t) { return /^(AND|OR|NOT)$/.test(t) || t.indexOf(':') > 0 ? t : 'TITLE_ABS:' + t; }); }
  /* The watchlist as the queries see it. Indications in scope are core (where the user competes: headline numbers, charts,
     benchmarks and competitor tracking) or watch (adjacent or expansion indications, pulled into feeds and searches).
     Main competitors are the watched assets, other than the user's own, in at least one core indication (or with none
     listed); the rest are watch-indication assets, shown for context. */
  function state(t, w) {
    w = w || defaultWatch(t);
    var all = t.assets.concat(w.custom || []).map(asset), byId = {}; all.forEach(function (a) { byId[a.id] = a; });
    var ours = (w.ours || []).filter(function (id) { return byId[id]; });
    var watched = all.filter(function (a) { return ours.indexOf(a.id) >= 0 || (w.assets || []).indexOf(a.id) >= 0; });
    watched.forEach(function (a) { a.ours = ours.indexOf(a.id) >= 0; });
    watched.sort(function (a, b) { return (b.ours ? 1 : 0) - (a.ours ? 1 : 0); });
    var scope = t.inds.filter(function (i) { return (w.scope || []).indexOf(i.id) >= 0; });
    var core = scope.filter(function (i) { return w.core ? w.core.indexOf(i.id) >= 0 : i.core; }); if (!core.length) core = scope.slice(0, 3);
    var coreIds = core.map(function (i) { return i.id; });
    var watchInds = scope.filter(function (i) { return coreIds.indexOf(i.id) < 0; });
    var mine = watched.filter(function (a) { return a.ours; });
    var others = watched.filter(function (a) { return !a.ours; });
    var inCore = function (a) { return !a.inds.length || a.inds.some(function (i) { return coreIds.indexOf(i) >= 0; }); };
    return { ta: t, all: all, byId: byId, watched: watched, ours: mine, comps: others.filter(inCore), peri: others.filter(function (a) { return !inCore(a); }), scope: scope, core: core, watchInds: watchInds, inCore: inCore };
  }
  /* ---------- Watchlists over one or more therapeutic areas ----------
     A watchlist stores profile { ta (the first area), tas (every area), country }, ours (products of interest, asset ids),
     over ('<area>/<indication>' -> 'core' | 'watch' | 'off': the user's own choices), aover (asset id -> 1 watched, 0 not)
     and custom (assets added by hand, each with its area in 'ta'). resolve() turns that into one therapeutic area, merged
     when there are several, and the { scope, core, assets, ours, custom } that state() and configs() read. */
  var MERGED = {};
  function copy(o) { var c = {}; Object.keys(o).forEach(function (k) { c[k] = o[k]; }); return c; }
  /* The areas of a profile: tas when it is current (its first is ta), else ta alone. */
  function tasOf(p) {
    p = p || {}; var ids = p.tas && p.tas.length && p.tas[0] === p.ta ? p.tas : [p.ta];
    ids = ids.filter(function (id, i) { return id && ta(id).id === id && ids.indexOf(id) === i; });
    return ids.length ? ids : [TAS[0].id];
  }
  /* The areas that list an asset. */
  function areasOf(assetId) { return TAS.filter(function (t) { return t.assets.some(function (a) { return a.id === assetId; }); }).map(function (t) { return t.id; }); }
  /* One therapeutic area made of several: indications and assets once each (an asset in several areas keeps all its
     indications; an indication id two areas use for different conditions gets the second area's id appended), and the
     areas' guideline bodies, congresses, themes and other lists together. indMap: area -> its indication id -> merged id. */
  function merge(ids) {
    if (ids.length === 1) { var t1 = ta(ids[0]), m1 = {}; m1[t1.id] = {}; t1.inds.forEach(function (i) { m1[t1.id][i.id] = i.id; }); t1.indMap = t1.indMap || m1; return t1; }
    var key = ids.join('+'); if (MERGED[key]) return MERGED[key];
    var list = ids.map(ta), inds = [], byInd = {}, assets = [], byAsset = {}, maps = {};
    list.forEach(function (t) {
      var m = maps[t.id] = {};
      t.inds.forEach(function (i) {
        var have = byInd[i.id]; if (have && have.name === i.name) { m[i.id] = i.id; return; }
        var o = copy(i); o.id = have ? i.id + '_' + t.id : i.id; o.ta = t.id; m[i.id] = o.id; byInd[o.id] = o; inds.push(o);
      });
    });
    list.forEach(function (t) {
      t.assets.forEach(function (a) {
        var mi = (a.inds || []).map(function (x) { return maps[t.id][x] || x; }), have = byAsset[a.id];
        if (have) { mi.forEach(function (x) { if (have.inds.indexOf(x) < 0) have.inds.push(x); }); return; }
        var o = copy(a); o.inds = mi; byAsset[a.id] = o; assets.push(o);
      });
    });
    function cat(k) { var out = [], seen = {}; list.forEach(function (t) { (t[k] || []).forEach(function (x) { var s = Array.isArray(x) ? String(x[0]) : String(x); if (!seen[s]) { seen[s] = 1; out.push(x); } }); }); return out; }
    var advocacy = []; list.forEach(function (t) { (t.advocacy || []).forEach(function (x) { if (!advocacy.some(function (y) { return y[0] === x[0]; })) advocacy.push([x[0], x[1], (x[2] || []).map(function (i) { return maps[t.id][i] || i; })].concat(x.slice(3))); }); });
    var M = { id: key, name: list.map(function (t) { return t.name; }).join(' + '), short: list.map(function (t) { return t.short || t.name; }).join(' + '), desc: list.map(function (t) { return t.desc; }).filter(Boolean).join(' '),
      specialties: list.map(function (t) { return t.specialties; }).filter(Boolean).join('|'),
      inds: inds, assets: assets, fedTerms: cat('fedTerms'), guides: cat('guides'), congresses: cat('congresses'), advocacy: advocacy, themes: cat('themes'), pros: cat('pros'), endpoints: cat('endpoints'), elig: cat('elig'), gaps: cat('gaps'), pops: cat('pops'), tas: ids, indMap: maps };
    MERGED[key] = M; return M;
  }
  /* The scheduled intel job (jobs/fetch-intel.mjs) watches every area at once, so it labels records with the indication
     ids of merge(every area). indsFromAll(ids) maps those ids to the ids of merge(ids), for the areas of a watchlist. */
  function allIds() { return TAS.map(function (t) { return t.id; }); }
  function indsFromAll(ids) {
    var all = merge(allIds()).indMap, own = merge(ids).indMap, out = {};
    ids.forEach(function (a) { Object.keys(all[a] || {}).forEach(function (k) { if (own[a] && own[a][k]) out[all[a][k]] = own[a][k]; }); });
    return out;
  }
  /* Core and watch set from the products of interest. With products: their indications are core; the other indications
     where an asset competing in a core indication also plays are watch; so are the key indications of an area added
     without a product; the rest are off. Without products: each area's key indications are core and the rest watch. */
  function autoTiers(t, all, ours) {
    var tier = {}, core = {}, watch = {}, areas = {};
    all.forEach(function (a) { if (ours.indexOf(a.id) >= 0) a.inds.forEach(function (i) { core[i] = 1; }); });
    if (!Object.keys(core).length) { t.inds.forEach(function (i) { tier[i.id] = i.core ? 'core' : 'watch'; }); return tier; }
    all.forEach(function (a) { if (ours.indexOf(a.id) < 0 && a.inds.some(function (i) { return core[i]; })) a.inds.forEach(function (i) { if (!core[i]) watch[i] = 1; }); });
    t.inds.forEach(function (i) { if (core[i.id]) areas[i.ta || t.id] = 1; });
    t.inds.forEach(function (i) { tier[i.id] = core[i.id] ? 'core' : watch[i.id] || (!areas[i.ta || t.id] && i.core) ? 'watch' : 'off'; });
    return tier;
  }
  function resolve(c) {
    var ids = tasOf(c.profile), t = merge(ids), maps = t.indMap;
    var custom = (c.custom || []).filter(function (a) { return ids.indexOf(a.ta) >= 0; }).map(function (a) { var o = copy(a); o.inds = (a.inds || []).map(function (x) { return (maps[a.ta] || {})[x] || x; }); return o; });
    var all = t.assets.concat(custom).map(function (a) { return { id: a.id, inds: a.inds || [] }; }), known = all.map(function (a) { return a.id; });
    var ours = (c.ours || []).filter(function (id, i, arr) { return known.indexOf(id) >= 0 && arr.indexOf(id) === i; });
    var auto = autoTiers(t, all, ours), tier = {}, over = c.over || {}, set = {};
    t.inds.forEach(function (i) { tier[i.id] = auto[i.id]; });
    Object.keys(over).forEach(function (k) { var s = k.split('/'), id = (maps[s[0]] || {})[s[1]]; if (id && tier[id] != null && ['core', 'watch', 'off'].indexOf(over[k]) >= 0) { tier[id] = over[k]; set[id] = 1; } });
    if (!t.inds.some(function (i) { return tier[i.id] === 'core'; })) { var first = t.inds.filter(function (i) { return tier[i.id] === 'watch'; })[0] || t.inds[0]; tier[first.id] = 'core'; }
    var aover = c.aover || {};
    var assets = all.filter(function (a) { return ours.indexOf(a.id) >= 0 || (aover[a.id] != null ? !!aover[a.id] : !a.inds.length || a.inds.some(function (i) { return tier[i] && tier[i] !== 'off'; })); }).map(function (a) { return a.id; });
    /* The stored keys for a merged indication id: one per area that has it. */
    function keysOf(id) { return ids.filter(function (a) { return maps[a] && Object.keys(maps[a]).some(function (k) { return maps[a][k] === id; }); }).map(function (a) { return a + '/' + Object.keys(maps[a]).filter(function (k) { return maps[a][k] === id; })[0]; }); }
    return { t: t, tas: ids, auto: auto, tier: tier, manual: set, keysOf: keysOf,
      w: { scope: t.inds.filter(function (i) { return tier[i.id] !== 'off'; }).map(function (i) { return i.id; }), core: t.inds.filter(function (i) { return tier[i.id] === 'core'; }).map(function (i) { return i.id; }), assets: assets, ours: ours, custom: custom } };
  }
  function orq(list) { return '(' + list.map(function (a) { return a.epmc; }).join(' OR ') + ')'; }
  function gapRows(t) { return GENERIC.gapsBefore.concat(t.gaps || [], GENERIC.gapsAfter); }
  function reSrc(r) { return r ? r.source : null; }
  /* Section settings for the snapshot builders (js/snapshot-builders.js). The browser and the nightly job derive them
     the same way, so a snapshot section is reused only when it was built for the same watchlist (cfg_key). */
  function configs(t, w) {
    var s = state(t, w), brands = s.watched.filter(function (a) { return a.brand; });
    var pharmacy = brands.filter(function (a) { return ['Intravenous', 'Intravitreal', 'Intrathecal'].indexOf(a.route) < 0; });
    var sib = {}; brands.forEach(function (a) { if (a.sibling) sib[a.brand] = a.sibling; });
    return {
      epmc_monthly: s.core.length ? { inds: s.core.map(function (i) { return [i.id, i.name, titleAbs(i.epmc)]; }) } : null,
      epmc_sov: s.watched.length ? { assets: s.watched.map(function (a) { return [a.id, a.short, a.epmc]; }) } : null,
      epmc_gap: s.ours.length && s.comps.length && s.core.length ? { ours: orq(s.ours), class: orq(s.comps), inds: s.core.map(function (i) { return [i.id, i.epmc]; }), tags: gapRows(t).map(function (g) { return [g[0], g[1], g[2]]; }) } : null,
      partd: pharmacy.length ? { brands: pharmacy.slice(0, 6).map(function (a) { return a.brand.charAt(0) + a.brand.slice(1).toLowerCase(); }) } : null,
      faers: brands.length ? { products: brands.slice(0, 8).map(function (a) { return a.brand; }), sibling: sib } : null,
      ctgov_density: s.core.length ? { inds: s.core.map(function (i) { return [i.id, i.ct, reSrc(i.not)]; }) } : null,
      ctgov_enrollment: s.core.length ? { inds: s.core.map(function (i) { return [i.id, i.ct]; }) } : null,
      pipeline: s.watched.length ? { assets: s.watched.map(function (a) { return [a.id, { intr: a.intr, sponsor: a.sponsor, only: reSrc(a.only), label: a.generic, route: a.labelRoute || null }]; }), inds: t.inds.map(function (i) { return [i.id, reSrc(i.re), reSrc(i.not), reSrc(i.label)]; }) } : null
    };
  }

  /* ---------- Reviewed updates (data/catalog-updates.js, written by jobs/review-catalog.mjs) ----------
     Each change passed three independent reviews before it was written. They only add or correct: never an id, never a
     removal, never a query field of an existing entry. A change is skipped when its target is gone or a person has
     since edited the value it corrects ('from'), so a hand edit here always wins.
       set       { asset, field: brand|company|moa|route, from, to }   in every area that lists the asset
       add_code  { asset, value }                                      development code, in every area
       add_link  { ta, asset, ind }                                    the asset's indications within an area
       add_ind   { ta, entry }   re / label / not as pattern strings   add_asset { ta, entry } */
  var SET_FIELDS = { brand: 1, company: 1, moa: 1, route: 1 };
  function applyUpdates(changes) {
    var out = { applied: 0, skipped: [] };
    function note(a, c) { (a.updates = a.updates || []).push({ op: c.op, field: c.field || null, from: c.from == null ? null : c.from, value: c.to || c.value || c.ind || null, at: c.applied_utc || null }); }
    function rx(s) { try { return s ? new RegExp(s, 'i') : undefined; } catch (e) { return null; } }
    (changes || []).forEach(function (c) {
      var hit = false, t = c.ta ? TAS.filter(function (x) { return x.id === c.ta; })[0] : null;
      if (c.op === 'set' || c.op === 'add_code') {
        TAS.forEach(function (x) {
          x.assets.forEach(function (a) {
            if (a.id !== c.asset) return;
            if (c.op === 'set' && SET_FIELDS[c.field] && String(a[c.field] || '') === String(c.from || '') && c.to) { a[c.field] = c.to; note(a, c); hit = true; }
            if (c.op === 'add_code' && c.value && !(a.codes || []).some(function (k) { return k.toLowerCase() === String(c.value).toLowerCase(); })) { a.codes = (a.codes || []).concat([c.value]); note(a, c); hit = true; }
          });
        });
      } else if (c.op === 'add_link' && t) {
        var a = t.assets.filter(function (x) { return x.id === c.asset; })[0];
        if (a && t.inds.some(function (i) { return i.id === c.ind; }) && (a.inds || []).indexOf(c.ind) < 0) { a.inds = (a.inds || []).concat([c.ind]); note(a, c); hit = true; }
      } else if (c.op === 'add_ind' && t && c.entry && c.entry.id && !t.inds.some(function (i) { return i.id === c.entry.id; })) {
        var e = {}; Object.keys(c.entry).forEach(function (k) { e[k] = c.entry[k]; });
        e.re = rx(c.entry.re); e.label = rx(c.entry.label); e.not = rx(c.entry.not);
        if (e.re && e.label && e.not !== null) { e.added = c.applied_utc || true; t.inds.push(e); hit = true; }
      } else if (c.op === 'add_asset' && t && c.entry && c.entry.id && !t.assets.some(function (x) { return x.id === c.entry.id; })) {
        var n = {}; Object.keys(c.entry).forEach(function (k) { n[k] = c.entry[k]; });
        n.inds = (n.inds || []).filter(function (k) { return t.inds.some(function (i) { return i.id === k; }); });
        if (n.name && n.company) { n.added = c.applied_utc || true; t.assets.push(n); hit = true; }
      }
      if (hit) out.applied++; else out.skipped.push(c.id || c.op);
    });
    return out;
  }
  var UPD = typeof module === 'object' && module.exports ? (function () { try { return require('../data/catalog-updates.js'); } catch (e) { return null; } })() : root.MIP_CATALOG_UPDATES;
  var updates = { generated_utc: (UPD && UPD.generated_utc) || null, total: UPD && UPD.changes ? UPD.changes.length : 0 };
  var res = applyUpdates(UPD && UPD.changes); updates.applied = res.applied; updates.skipped = res.skipped;

  var api = { TAS: TAS, GENERIC: GENERIC, ROUTES: ROUTES, ta: ta, asset: asset, defaultWatch: defaultWatch, state: state, merge: merge, resolve: resolve, tasOf: tasOf, areasOf: areasOf, allIds: allIds, indsFromAll: indsFromAll, configs: configs, gapRows: gapRows, titleAbs: titleAbs, applyUpdates: applyUpdates, updates: updates };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.MIP_CATALOG = api;
})(this);
