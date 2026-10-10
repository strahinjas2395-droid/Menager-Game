/**
 * Unofficial fictional football identities.
 *
 * Club and marquee-player names deliberately evoke familiar football history
 * without reproducing an official club or player identity verbatim. The game
 * does not use badges, photographs, official kits or licensed competition data.
 */
import { applyIconicPrimeProfile, getIconicPrimeProfileByAlias } from "@/engine/iconicPrimeProfiles";
import { PlaystyleTag, PrimaryPosition, type Player } from "@/types";

export type ClubIdentityKey =
  | "bretherland-1"
  | "bretherland-2"
  | "valdoria-1"
  | "valdoria-2"
  | "azzuriland-1"
  | "gallonde-1"
  | "schwarzland-1"
  | "schwarzland-2"
  | "oranjeland-1"
  | "nordheim-1"
  | "campoverde-1"
  | "campoverde-2"
  | "lusitana-1"
  | "slavonica-1"
  | "caledonia-1"
  | "emeraldia-1"
  | "helvetica-1"
  | "anatolia-1"
  | "hellenia-1"
  | "hellenia-2";

/** Twenty recognisable but unofficial club aliases for every playable division. */
export const RECOGNISABLE_CLUBS: Record<ClubIdentityKey, readonly string[]> = {
  "bretherland-1": [
    "Manchester Sky", "Liverpool Mersey", "North London Cannons", "Chelsea Borough",
    "Manchester Scarlet", "Tottenham White Hart", "Newcastle Magpies", "Birmingham Villans",
    "Brighton Seabirds", "West London Bees", "East London Irons", "South London Eagles",
    "Fulham Riverside", "Everton Royal Blue", "Wolverhampton Gold", "Bournemouth Cherries",
    "Nottingham Sherwood", "Leicester Foxes", "Southampton Saints", "Ipswich Tractor Boys",
  ],
  "bretherland-2": [
    "Leeds White Rose", "Burnley Claret", "Sheffield Blades", "Sunderland Black Cats",
    "Middlesbrough Teesside", "Coventry Sky Blue", "Norwich Canaries", "Watford Hornets",
    "West Bromwich Stripes", "Blackburn Blue Rose", "Bristol Robins", "Swansea Swans",
    "Cardiff Dragons", "Stoke Potters", "Hull Tigers", "Preston Lilywhites",
    "Derby Rams", "Portsmouth Harbour", "West London Hoops", "Millwall Lions",
  ],
  "valdoria-1": [
    "Madrid Royal White", "Barcelona Blau", "Madrid Red-White", "Bilbao Lions",
    "San Sebastian Royal", "Villarreal Yellow", "Seville Green-White", "Seville Nervion",
    "Valencia Bats", "Girona Red", "Vigo Celts", "Pamplona Reds",
    "Mallorca Islanders", "Getafe Azul", "Vallecano Bolts", "Las Palmas Gold",
    "Alaves Blue-White", "Leganes Cucumber", "Valladolid Violet", "Barcelona Parakeets",
  ],
  "valdoria-2": [
    "Zaragoza Lions", "Gijon Red-White", "Oviedo Blue", "Santander Green",
    "Eibar Armourers", "Levante Frogs", "Elche Palms", "Granada Nazar",
    "Almeria Indalo", "Cadiz Yellow", "Cordoba Caliphs", "Malaga Anchovies",
    "Tenerife Chicharro", "Coruna Hercules", "Castellon Black-White", "Burgos Castle",
    "Huesca Pyrenees", "Mirandes Boars", "Albacete Manchego", "Ferrol Arsenal",
  ],
  "azzuriland-1": [
    "Milan Redblack", "Milan Nerazzurro", "Turin Zebra", "Naples Azure",
    "Rome Wolves", "Rome Eagles", "Bergamo Goddess", "Florence Viola",
    "Bologna Redblue", "Turin Bull", "Genoa Griffin", "Genoa Sailors",
    "Udine Zebrette", "Parma Ducals", "Verona Mastiffs", "Cagliari Islanders",
    "Lecce Salento", "Monza Crown", "Como Lake", "Venice Winged Lions",
  ],
  "gallonde-1": [
    "Paris Stars", "Marseille Phoceans", "Monaco Principality", "Lyon Lions",
    "Lille Mastiffs", "Nice Eaglets", "Lens Blood-Gold", "Brittany Redblack",
    "Strasbourg Alsace", "Toulouse Violet", "Nantes Canaries", "Montpellier Paillade",
    "Bordeaux Girondins", "Saint-Etienne Greens", "Auxerre Burgundy", "Reims Champagne",
    "Brest Pirates", "Lorient Hakes", "Metz Maroon", "Le Havre Sky-Navy",
  ],
  "schwarzland-1": [
    "Munich Red", "Dortmund Yellow Wall", "Leverkusen Werkself", "Leipzig Bulls",
    "Frankfurt Eagles", "Stuttgart Swabians", "Freiburg Breisgau", "Wolfsburg Wolves",
    "Gladbach Foals", "Bremen Green-White", "Berlin Union", "Mainz Carnival",
    "Augsburg Fugger", "Hoffenheim Village", "Hamburg Harbour", "Schalke Miners",
    "Cologne Goats", "Berlin Blue-White", "Nuremberg Franconians", "Kaiserslautern Red Devils",
  ],
  "schwarzland-2": [
    "Hannover Reds", "Dusseldorf Fortune", "Karlsruhe Blue", "Paderborn East-West",
    "Darmstadt Lilies", "St Pauli Pirates", "Kiel Storks", "Bochum Ruhr",
    "Bielefeld Blues", "Braunschweig Lions", "Furth Clover", "Magdeburg Blue-White",
    "Rostock Hanseatic", "Dresden Power", "Duisburg Zebras", "Essen Red-White",
    "Mannheim Baroque", "Saarbrucken Blue-Black", "Regensburg Rivers", "Munster Eagles",
  ],
  "oranjeland-1": [
    "Amsterdam Artists", "Eindhoven Lamps", "Rotterdam South", "Rotterdam Castle",
    "Alkmaar Cheese", "Enschede Reds", "Utrecht Cathedral", "Arnhem Eagles",
    "Nijmegen Tricolour", "Heerenveen Hearts", "Groningen Green-White", "Tilburg Tricolores",
    "Breda Rats", "Almelo Black-White", "Zwolle Bluefingers", "Sittard Fortune",
    "Waalwijk Yellow-Blue", "Deventer Eagles", "Volendam Orange", "The Hague Storks",
  ],
  "nordheim-1": [
    "Trondheim Trolls", "Molde Blue", "Bodo Lightning", "Bergen Fire",
    "Stavanger Vikings", "Oslo Valerenga", "Lillestrom Canaries", "Drammen Godset",
    "Skien Oddballs", "Tromso Arctic", "Kristiansand Start", "Fredrikstad Red-White",
    "Sarpsborg Blue", "Haugesund Seagulls", "Sandefjord Whalers", "Aalesund Orange",
    "Hamar Pride", "Moss Yellow-Black", "Oslo Lynx", "Stabaek Blue",
  ],
  "campoverde-1": [
    "Rio Flamengo", "Sao Paulo Palmeiras", "Sao Paulo Corinthians", "Rio Vasco",
    "Rio Fluminense", "Rio Lone Star", "Santos Coast", "Sao Paulo Tricolor",
    "Porto Alegre Gremio", "Porto Alegre Internacional", "Belo Horizonte Atletico", "Belo Horizonte Cruzeiro",
    "Curitiba Athletico", "Curitiba Coritiba", "Salvador Bahia", "Recife Lions",
    "Fortaleza Tricolor", "Ceara Black-White", "Goiania Green", "Braganca Red Bulls",
  ],
  "campoverde-2": [
    "Vitoria Red Lion", "Recife Nautico", "Campinas Ponte", "Campinas Guarani",
    "Belo America", "Rio America", "Avai Island", "Florianopolis Figueira",
    "Chapeco Green", "Goias Vila", "Belem Paysandu", "Belem Remo",
    "Maceio CRB", "Maceio CSA", "Natal ABC", "Recife Santa Cross",
    "Parana Londrina", "Criciuma Tigers", "Caxias Juventude", "Cuiaba Gold",
  ],
  "lusitana-1": [
    "Lisbon Eagles", "Porto Dragons", "Lisbon Lions", "Braga Archbishops",
    "Guimaraes Conquerors", "Famalicao Blue-White", "Boavista Checkers", "Rio Ave Vila",
    "Estoril Canaries", "Barcelos Roosters", "Moreira Green-White", "Arouca Wolves",
    "Farense Algarve", "Casa Pia Geese", "Madeira Nacional", "Madeira Maritimo",
    "Setubal Sadinos", "Coimbra Students", "Belenenses Cross", "Pacos Beavers",
  ],
  "slavonica-1": [
    "Belgrade Red Constellation", "Belgrade Black-White", "Zagreb Blue", "Split White",
    "Rijeka Armada", "Osijek Slavon", "Novi Sad Vojvodina", "Backa Topola Blue",
    "Cukarica Hills", "Nis Radnicki Red", "Sarajevo Maroon", "Sarajevo Railway",
    "Banja Luka Red-Blue", "Mostar Bridge", "Ljubljana Dragons", "Maribor Violet",
    "Podgorica Blue", "Skopje Red-Black", "Zagreb Locomotive", "Subotica Spartans",
  ],
  "caledonia-1": [
    "Glasgow Hoops", "Glasgow Light Blues", "Edinburgh Hearts", "Edinburgh Hibees",
    "Aberdeen Reds", "Dundee Tangerines", "Dundee Dark Blues", "Kilmarnock Blue-White",
    "Motherwell Steel", "Paisley Saints", "Perth Saints", "Livingston Amber",
    "Ross County Stags", "Inverness Caley", "Falkirk Navy", "Dunfermline Pars",
    "Partick Jags", "Greenock Morton Blue", "Ayr Honest Men", "Raith Rovers Blue",
  ],
  "emeraldia-1": [
    "Dublin Shamrocks", "Dublin Bohemes", "Derry Candystripes", "Dundalk Lilywhites",
    "Cork Rebels", "Sligo Bit-O-Red", "Waterford Blues", "Galway Tribes",
    "Drogheda Boyneside", "Shelbourne Reds", "Inchicore Saints", "Donegal Harps",
    "Limerick Treaty", "Bray Seagulls", "Cobh Rams", "Wexford Youths",
    "Athlone Midlands", "Longford Red-Black", "Dublin Scholars", "Kilkenny Cats",
  ],
  "helvetica-1": [
    "Basel Red-Blue", "Zurich Hoppers", "Bern Youngsters", "Zurich Blue-White",
    "Geneva Servette", "Lugano Black-White", "Lucerne Blue", "St Gallen Green",
    "Sion Valais", "Lausanne Blue-White", "Winterthur Lions", "Thun Alps",
    "Neuchatel Black-Red", "Aarau Argovia", "Bellinzona Castles", "Schaffhausen Rhine",
    "Wil Abbey", "Vaduz Crown", "Xamax Lakeside", "Chiasso Border",
  ],
  "anatolia-1": [
    "Istanbul Lions", "Istanbul Canaries", "Istanbul Black Eagles", "Trabzon Storm",
    "Istanbul Basak Owls", "Bursa Crocodiles", "Adana Blue Lightning", "Adana Iron",
    "Konya Eagles", "Antalya Scorpions", "Alanya Orange-Green", "Sivas Braves",
    "Kayseri Anatolian Stars", "Rize Tea", "Gaziantep Falcons", "Samsun Red Lightning",
    "Goztepe Izmir", "Izmir Altay", "Ankara Power", "Eskisehir Red-Black",
  ],
  "hellenia-1": [
    "Piraeus Red-White", "Athens Shamrock", "Athens Double Eagles", "Thessaloniki Double Eagle",
    "Thessaloniki War God", "Heraklion Snakes", "Tripoli Stars", "Crete Blue-White",
    "Volos Argonauts", "Peristeri Fearless", "Smyrna Blue-Red", "Larissa Crimson",
    "Ioannina Epirus", "Agrinio Canaries", "Lamia Blue-White", "Xanthi Thrace",
    "Kavala Blue", "Rhodes Deer", "Patras Red-Black", "Nikaia Blue-White",
  ],
  "hellenia-2": [
    "Thessaloniki Demigods", "Smyrna Light", "Athens Panion", "Piraeus Ionic",
    "Kalamata Black Storm", "Kallithea South Athens", "Chania Crete", "Ergotelis Heraklion",
    "Levadiakos Green-Blue", "Veria Queen North", "Drama Black Eagles", "Serres Lions",
    "Kozani Red", "Niki Volos Blue", "Karditsa Renaissance", "Trikala Blue",
    "Corfu Phaeacians", "Rethymno Cretan", "Elefsina Shipyards", "Aigaleo Blue-White",
  ],
};

export interface IconicPlayerAlias {
  firstName: string;
  lastName: string;
  position: PrimaryPosition;
  playstyles?: PlaystyleTag[];
}

/**
 * A mixed-era set of deliberately altered marquee names. They are assigned to
 * the strongest compatible generated footballer, so no separate overall
 * rating or licensed real-world database is introduced.
 */
export const ICONIC_PLAYER_ALIASES: Readonly<Record<string, readonly IconicPlayerAlias[]>> = {
  "Manchester Sky": [
    { firstName: "Erling", lastName: "Haland", position: PrimaryPosition.ST, playstyles: [PlaystyleTag.PaceAbuser, PlaystyleTag.ClinicalFinisher] },
    { firstName: "Kevan", lastName: "De Bruin", position: PrimaryPosition.CAM, playstyles: [PlaystyleTag.Playmaker, PlaystyleTag.ThroughBallSpecialist] },
    { firstName: "Sergio", lastName: "Aguera", position: PrimaryPosition.ST, playstyles: [PlaystyleTag.Poacher] },
  ],
  "Liverpool Mersey": [
    { firstName: "Mohamed", lastName: "Sala", position: PrimaryPosition.RW, playstyles: [PlaystyleTag.CreativeInsideForward, PlaystyleTag.ClinicalFinisher] },
    { firstName: "Steven", lastName: "Gerrad", position: PrimaryPosition.CM, playstyles: [PlaystyleTag.BoxToBox, PlaystyleTag.LongShotSpecialist] },
    { firstName: "Virgil", lastName: "Van Dyke", position: PrimaryPosition.CB, playstyles: [PlaystyleTag.AerialThreat, PlaystyleTag.Leader] },
  ],
  "North London Cannons": [
    { firstName: "Thierry", lastName: "Henri", position: PrimaryPosition.ST, playstyles: [PlaystyleTag.PaceAbuser, PlaystyleTag.ClinicalFinisher] },
    { firstName: "Dennis", lastName: "Bergkam", position: PrimaryPosition.CAM, playstyles: [PlaystyleTag.FirstTouchSpecialist, PlaystyleTag.Playmaker] },
    { firstName: "Bukayo", lastName: "Sakha", position: PrimaryPosition.RW, playstyles: [PlaystyleTag.Dribbler, PlaystyleTag.Crosser] },
  ],
  "Chelsea Borough": [
    { firstName: "Frank", lastName: "Lampart", position: PrimaryPosition.CM, playstyles: [PlaystyleTag.BoxToBox, PlaystyleTag.LongShotSpecialist] },
    { firstName: "Didier", lastName: "Drogbah", position: PrimaryPosition.ST, playstyles: [PlaystyleTag.TargetMan, PlaystyleTag.AerialThreat] },
    { firstName: "Eden", lastName: "Hazart", position: PrimaryPosition.LW, playstyles: [PlaystyleTag.Dribbler, PlaystyleTag.PressResistant] },
  ],
  "Manchester Scarlet": [
    { firstName: "Wayne", lastName: "Roonie", position: PrimaryPosition.ST, playstyles: [PlaystyleTag.PressingForward, PlaystyleTag.LongShotSpecialist] },
    { firstName: "David", lastName: "Beckam", position: PrimaryPosition.RW, playstyles: [PlaystyleTag.Crosser, PlaystyleTag.SetPieceSpecialist] },
    { firstName: "Georgie", lastName: "Beste", position: PrimaryPosition.LW, playstyles: [PlaystyleTag.Dribbler] },
  ],
  "Tottenham White Hart": [
    { firstName: "Harry", lastName: "Kayne", position: PrimaryPosition.ST, playstyles: [PlaystyleTag.ClinicalFinisher, PlaystyleTag.Playmaker] },
    { firstName: "Gareth", lastName: "Baille", position: PrimaryPosition.RW, playstyles: [PlaystyleTag.PaceAbuser, PlaystyleTag.LongShotSpecialist] },
  ],
  "Newcastle Magpies": [
    { firstName: "Alan", lastName: "Sheerer", position: PrimaryPosition.ST, playstyles: [PlaystyleTag.ClinicalFinisher, PlaystyleTag.AerialThreat] },
    { firstName: "Peter", lastName: "Beardslay", position: PrimaryPosition.CAM, playstyles: [PlaystyleTag.Playmaker] },
  ],
  "Birmingham Villans": [
    { firstName: "Paul", lastName: "McGratt", position: PrimaryPosition.CB, playstyles: [PlaystyleTag.Leader] },
    { firstName: "Jakk", lastName: "Greelish", position: PrimaryPosition.LW, playstyles: [PlaystyleTag.Dribbler] },
  ],
  "Everton Royal Blue": [
    { firstName: "Dixie", lastName: "Deane", position: PrimaryPosition.ST, playstyles: [PlaystyleTag.AerialThreat, PlaystyleTag.ClinicalFinisher] },
  ],
  "East London Irons": [
    { firstName: "Bobby", lastName: "Moor", position: PrimaryPosition.CB, playstyles: [PlaystyleTag.BallPlayingDefender, PlaystyleTag.Leader] },
  ],
  "Leicester Foxes": [
    { firstName: "Jamie", lastName: "Vardie", position: PrimaryPosition.ST, playstyles: [PlaystyleTag.PaceAbuser, PlaystyleTag.Poacher] },
  ],
  "Madrid Royal White": [
    { firstName: "Alfredo", lastName: "Di Stefana", position: PrimaryPosition.ST, playstyles: [PlaystyleTag.SpaceInterpreter, PlaystyleTag.Leader] },
    { firstName: "Zinedin", lastName: "Zidan", position: PrimaryPosition.CAM, playstyles: [PlaystyleTag.Playmaker, PlaystyleTag.PressResistant] },
    { firstName: "Raul", lastName: "Gonzales", position: PrimaryPosition.ST, playstyles: [PlaystyleTag.Poacher] },
  ],
  "Barcelona Blau": [
    { firstName: "Lionel", lastName: "Messio", position: PrimaryPosition.RW, playstyles: [PlaystyleTag.Dribbler, PlaystyleTag.ClinicalFinisher, PlaystyleTag.Playmaker] },
    { firstName: "Xavi", lastName: "Hernandes", position: PrimaryPosition.CM, playstyles: [PlaystyleTag.Playmaker, PlaystyleTag.ThroughBallSpecialist] },
    { firstName: "Andres", lastName: "Inyesta", position: PrimaryPosition.CM, playstyles: [PlaystyleTag.PressResistant, PlaystyleTag.FirstTouchSpecialist] },
  ],
  "Madrid Red-White": [
    { firstName: "Antoin", lastName: "Griezman", position: PrimaryPosition.ST, playstyles: [PlaystyleTag.SpaceInterpreter] },
    { firstName: "Diago", lastName: "Godin", position: PrimaryPosition.CB, playstyles: [PlaystyleTag.Leader, PlaystyleTag.AerialThreat] },
    { firstName: "Fernando", lastName: "Torrez", position: PrimaryPosition.ST, playstyles: [PlaystyleTag.PaceAbuser, PlaystyleTag.Poacher] },
  ],
  "Bilbao Lions": [
    { firstName: "Iker", lastName: "Munian", position: PrimaryPosition.CAM, playstyles: [PlaystyleTag.Dribbler] },
    { firstName: "Andoni", lastName: "Zubizareta", position: PrimaryPosition.GK, playstyles: [PlaystyleTag.Leader] },
  ],
  "San Sebastian Royal": [
    { firstName: "Xabi", lastName: "Alonzo", position: PrimaryPosition.CDM, playstyles: [PlaystyleTag.Playmaker, PlaystyleTag.LongShotSpecialist] },
  ],
  "Valencia Bats": [
    { firstName: "David", lastName: "Villan", position: PrimaryPosition.ST, playstyles: [PlaystyleTag.ClinicalFinisher] },
    { firstName: "Gaizko", lastName: "Mendietta", position: PrimaryPosition.CM, playstyles: [PlaystyleTag.BoxToBox] },
  ],
  "Milan Redblack": [
    { firstName: "Paolo", lastName: "Maldino", position: PrimaryPosition.LB, playstyles: [PlaystyleTag.Leader, PlaystyleTag.Interceptor] },
    { firstName: "Franco", lastName: "Bareso", position: PrimaryPosition.CB, playstyles: [PlaystyleTag.Sweeper, PlaystyleTag.Leader] },
    { firstName: "Andriy", lastName: "Shevchenka", position: PrimaryPosition.ST, playstyles: [PlaystyleTag.PaceAbuser, PlaystyleTag.ClinicalFinisher] },
  ],
  "Milan Nerazzurro": [
    { firstName: "Javi", lastName: "Zaneti", position: PrimaryPosition.RB, playstyles: [PlaystyleTag.FullBackRunner, PlaystyleTag.Leader] },
    { firstName: "Ronaldo", lastName: "Nazaria", position: PrimaryPosition.ST, playstyles: [PlaystyleTag.Dribbler, PlaystyleTag.PaceAbuser, PlaystyleTag.ClinicalFinisher] },
    { firstName: "Diego", lastName: "Milita", position: PrimaryPosition.ST, playstyles: [PlaystyleTag.Poacher] },
  ],
  "Turin Zebra": [
    { firstName: "Alex", lastName: "Del Piera", position: PrimaryPosition.ST, playstyles: [PlaystyleTag.ClinicalFinisher, PlaystyleTag.SetPieceSpecialist] },
    { firstName: "Gianluigi", lastName: "Bufon", position: PrimaryPosition.GK, playstyles: [PlaystyleTag.Leader] },
    { firstName: "Pavel", lastName: "Nedvedo", position: PrimaryPosition.CAM, playstyles: [PlaystyleTag.LongShotSpecialist, PlaystyleTag.BoxToBox] },
  ],
  "Naples Azure": [
    { firstName: "Diago", lastName: "Maradona", position: PrimaryPosition.CAM, playstyles: [PlaystyleTag.Dribbler, PlaystyleTag.Playmaker] },
    { firstName: "Marek", lastName: "Hamsiq", position: PrimaryPosition.CAM, playstyles: [PlaystyleTag.BoxToBox] },
    { firstName: "Viktor", lastName: "Osimen", position: PrimaryPosition.ST, playstyles: [PlaystyleTag.PaceAbuser, PlaystyleTag.AerialThreat] },
  ],
  "Rome Wolves": [
    { firstName: "Francesco", lastName: "Toti", position: PrimaryPosition.CAM, playstyles: [PlaystyleTag.Playmaker, PlaystyleTag.ClinicalFinisher] },
    { firstName: "Daniele", lastName: "De Rosi", position: PrimaryPosition.CDM, playstyles: [PlaystyleTag.BallWinner, PlaystyleTag.Leader] },
  ],
  "Rome Eagles": [
    { firstName: "Alessio", lastName: "Nesta", position: PrimaryPosition.CB, playstyles: [PlaystyleTag.Interceptor] },
  ],
  "Paris Stars": [
    { firstName: "Kylian", lastName: "Mbape", position: PrimaryPosition.ST, playstyles: [PlaystyleTag.PaceAbuser, PlaystyleTag.ClinicalFinisher] },
    { firstName: "Zlatan", lastName: "Ibrahimovik", position: PrimaryPosition.ST, playstyles: [PlaystyleTag.TargetMan, PlaystyleTag.LongShotSpecialist] },
  ],
  "Marseille Phoceans": [
    { firstName: "Jean-Pierre", lastName: "Papen", position: PrimaryPosition.ST, playstyles: [PlaystyleTag.ClinicalFinisher] },
    { firstName: "Dimitri", lastName: "Payette", position: PrimaryPosition.CAM, playstyles: [PlaystyleTag.SetPieceSpecialist, PlaystyleTag.Playmaker] },
  ],
  "Monaco Principality": [
    { firstName: "Radamel", lastName: "Falkau", position: PrimaryPosition.ST, playstyles: [PlaystyleTag.Poacher, PlaystyleTag.AerialThreat] },
  ],
  "Lyon Lions": [
    { firstName: "Kareem", lastName: "Benzema", position: PrimaryPosition.ST, playstyles: [PlaystyleTag.FirstTouchSpecialist, PlaystyleTag.Playmaker] },
  ],
  "Saint-Etienne Greens": [
    { firstName: "Michel", lastName: "Platiny", position: PrimaryPosition.CAM, playstyles: [PlaystyleTag.Playmaker, PlaystyleTag.SetPieceSpecialist] },
  ],
  "Munich Red": [
    { firstName: "Franz", lastName: "Bekenbauer", position: PrimaryPosition.CB, playstyles: [PlaystyleTag.Sweeper, PlaystyleTag.BallPlayingDefender] },
    { firstName: "Tomas", lastName: "Muler", position: PrimaryPosition.CAM, playstyles: [PlaystyleTag.SpaceInterpreter] },
    { firstName: "Robert", lastName: "Lewandovski", position: PrimaryPosition.ST, playstyles: [PlaystyleTag.ClinicalFinisher, PlaystyleTag.AerialThreat] },
  ],
  "Dortmund Yellow Wall": [
    { firstName: "Marco", lastName: "Reuss", position: PrimaryPosition.CAM, playstyles: [PlaystyleTag.CreativeInsideForward] },
    { firstName: "Mats", lastName: "Humels", position: PrimaryPosition.CB, playstyles: [PlaystyleTag.BallPlayingDefender] },
  ],
  "Leverkusen Werkself": [
    { firstName: "Florian", lastName: "Wirt", position: PrimaryPosition.CAM, playstyles: [PlaystyleTag.Playmaker, PlaystyleTag.Dribbler] },
    { firstName: "Michael", lastName: "Balak", position: PrimaryPosition.CM, playstyles: [PlaystyleTag.BoxToBox, PlaystyleTag.LongShotSpecialist] },
  ],
  "Schalke Miners": [
    { firstName: "Manuel", lastName: "Noyer", position: PrimaryPosition.GK, playstyles: [PlaystyleTag.Sweeper] },
  ],
  "Amsterdam Artists": [
    { firstName: "Johan", lastName: "Cruijf", position: PrimaryPosition.CAM, playstyles: [PlaystyleTag.Playmaker, PlaystyleTag.Dribbler] },
    { firstName: "Marko", lastName: "Van Basten", position: PrimaryPosition.ST, playstyles: [PlaystyleTag.ClinicalFinisher] },
  ],
  "Eindhoven Lamps": [
    { firstName: "Rudd", lastName: "Gulit", position: PrimaryPosition.CAM, playstyles: [PlaystyleTag.BoxToBox, PlaystyleTag.AerialThreat] },
    { firstName: "Arjen", lastName: "Roben", position: PrimaryPosition.RW, playstyles: [PlaystyleTag.CreativeInsideForward, PlaystyleTag.LongShotSpecialist] },
  ],
  "Rotterdam South": [
    { firstName: "Robbin", lastName: "Van Persi", position: PrimaryPosition.ST, playstyles: [PlaystyleTag.ClinicalFinisher] },
  ],
  "Trondheim Trolls": [
    { firstName: "Roar", lastName: "Strann", position: PrimaryPosition.CM, playstyles: [PlaystyleTag.Leader] },
    { firstName: "Niklas", lastName: "Bendtna", position: PrimaryPosition.ST, playstyles: [PlaystyleTag.TargetMan] },
  ],
  "Molde Blue": [
    { firstName: "Ole Gunnar", lastName: "Solskjar", position: PrimaryPosition.ST, playstyles: [PlaystyleTag.Poacher] },
  ],
  "Rio Flamengo": [
    { firstName: "Arthur", lastName: "Ziko", position: PrimaryPosition.CAM, playstyles: [PlaystyleTag.Playmaker, PlaystyleTag.SetPieceSpecialist] },
    { firstName: "Adriano", lastName: "Emperador", position: PrimaryPosition.ST, playstyles: [PlaystyleTag.TargetMan, PlaystyleTag.LongShotSpecialist] },
  ],
  "Santos Coast": [
    { firstName: "Peleu", lastName: "Nascimento", position: PrimaryPosition.ST, playstyles: [PlaystyleTag.Playmaker, PlaystyleTag.ClinicalFinisher] },
    { firstName: "Ney", lastName: "Marinho", position: PrimaryPosition.LW, playstyles: [PlaystyleTag.Dribbler, PlaystyleTag.CreativeInsideForward] },
  ],
  "Sao Paulo Palmeiras": [
    { firstName: "Rivaldino", lastName: "Ferreira", position: PrimaryPosition.CAM, playstyles: [PlaystyleTag.LongShotSpecialist, PlaystyleTag.Dribbler] },
  ],
  "Sao Paulo Corinthians": [
    { firstName: "Socratis", lastName: "Brasileiro", position: PrimaryPosition.CAM, playstyles: [PlaystyleTag.Playmaker, PlaystyleTag.Leader] },
  ],
  "Sao Paulo Tricolor": [
    { firstName: "Ricardo", lastName: "Kakao", position: PrimaryPosition.CAM, playstyles: [PlaystyleTag.Playmaker, PlaystyleTag.PaceAbuser] },
    { firstName: "Rogerio", lastName: "Seni", position: PrimaryPosition.GK, playstyles: [PlaystyleTag.SetPieceSpecialist, PlaystyleTag.Leader] },
  ],
  "Porto Alegre Gremio": [
    { firstName: "Ronaldo", lastName: "Gaucho", position: PrimaryPosition.CAM, playstyles: [PlaystyleTag.Dribbler, PlaystyleTag.SetPieceSpecialist] },
  ],
  "Rio Vasco": [
    { firstName: "Romaria", lastName: "Souza", position: PrimaryPosition.ST, playstyles: [PlaystyleTag.Poacher, PlaystyleTag.ClinicalFinisher] },
  ],
  "Lisbon Eagles": [
    { firstName: "Eusebio", lastName: "Silvo", position: PrimaryPosition.ST, playstyles: [PlaystyleTag.PaceAbuser, PlaystyleTag.ClinicalFinisher] },
    { firstName: "Rui", lastName: "Costas", position: PrimaryPosition.CAM, playstyles: [PlaystyleTag.Playmaker] },
  ],
  "Porto Dragons": [
    { firstName: "Anderson", lastName: "Deko", position: PrimaryPosition.CAM, playstyles: [PlaystyleTag.Playmaker, PlaystyleTag.PressResistant] },
  ],
  "Lisbon Lions": [
    { firstName: "Cristiano", lastName: "Ronaldi", position: PrimaryPosition.LW, playstyles: [PlaystyleTag.PaceAbuser, PlaystyleTag.ClinicalFinisher, PlaystyleTag.AerialThreat] },
    { firstName: "Luis", lastName: "Figgo", position: PrimaryPosition.RW, playstyles: [PlaystyleTag.Dribbler, PlaystyleTag.Crosser] },
  ],
  "Belgrade Red Constellation": [
    { firstName: "Dragan", lastName: "Dzajik", position: PrimaryPosition.LW, playstyles: [PlaystyleTag.Dribbler, PlaystyleTag.Crosser] },
    { firstName: "Dejan", lastName: "Savicevik", position: PrimaryPosition.CAM, playstyles: [PlaystyleTag.Playmaker] },
  ],
  "Belgrade Black-White": [
    { firstName: "Predrag", lastName: "Mijatovik", position: PrimaryPosition.ST, playstyles: [PlaystyleTag.ClinicalFinisher] },
  ],
  "Zagreb Blue": [
    { firstName: "Luka", lastName: "Modriq", position: PrimaryPosition.CM, playstyles: [PlaystyleTag.Playmaker, PlaystyleTag.PressResistant] },
    { firstName: "Zvonimir", lastName: "Bobanov", position: PrimaryPosition.CAM, playstyles: [PlaystyleTag.Playmaker] },
  ],
  "Glasgow Hoops": [
    { firstName: "Henrik", lastName: "Larson", position: PrimaryPosition.ST, playstyles: [PlaystyleTag.Poacher, PlaystyleTag.ClinicalFinisher] },
    { firstName: "Jimi", lastName: "Johnstone", position: PrimaryPosition.RW, playstyles: [PlaystyleTag.Dribbler] },
  ],
  "Glasgow Light Blues": [
    { firstName: "Ally", lastName: "McCoyst", position: PrimaryPosition.ST, playstyles: [PlaystyleTag.Poacher] },
    { firstName: "Paul", lastName: "Gascoine", position: PrimaryPosition.CAM, playstyles: [PlaystyleTag.Dribbler, PlaystyleTag.Playmaker] },
  ],
  "Dublin Shamrocks": [
    { firstName: "Damian", lastName: "Duf", position: PrimaryPosition.LW, playstyles: [PlaystyleTag.Winger, PlaystyleTag.Crosser] },
    { firstName: "Robby", lastName: "Kean", position: PrimaryPosition.ST, playstyles: [PlaystyleTag.Poacher] },
  ],
  "Basel Red-Blue": [
    { firstName: "Xherdan", lastName: "Shaqiry", position: PrimaryPosition.RW, playstyles: [PlaystyleTag.CreativeInsideForward, PlaystyleTag.LongShotSpecialist] },
  ],
  "Istanbul Lions": [
    { firstName: "Gheorghe", lastName: "Hagy", position: PrimaryPosition.CAM, playstyles: [PlaystyleTag.Playmaker, PlaystyleTag.SetPieceSpecialist] },
  ],
  "Istanbul Canaries": [
    { firstName: "Alex", lastName: "De Souzza", position: PrimaryPosition.CAM, playstyles: [PlaystyleTag.Playmaker, PlaystyleTag.SetPieceSpecialist] },
    { firstName: "Roberto", lastName: "Carloz", position: PrimaryPosition.LB, playstyles: [PlaystyleTag.FullBackRunner, PlaystyleTag.LongShotSpecialist] },
  ],
  "Istanbul Black Eagles": [
    { firstName: "Ricardo", lastName: "Quaresmo", position: PrimaryPosition.RW, playstyles: [PlaystyleTag.Dribbler, PlaystyleTag.Crosser] },
  ],
  "Piraeus Red-White": [
    { firstName: "Predrag", lastName: "Djordjevik", position: PrimaryPosition.LW, playstyles: [PlaystyleTag.Winger, PlaystyleTag.SetPieceSpecialist] },
  ],
  "Athens Shamrock": [
    { firstName: "Djibril", lastName: "Cise", position: PrimaryPosition.ST, playstyles: [PlaystyleTag.PaceAbuser, PlaystyleTag.Poacher] },
  ],
};

export function clubIdentityNames(key: ClubIdentityKey): string[] {
  const clubs = RECOGNISABLE_CLUBS[key];
  if (clubs.length !== 20) throw new Error(`Club identity set ${key} must contain exactly 20 clubs.`);
  return [...clubs];
}

function positionalScore(player: Player, position: PrimaryPosition): number {
  const exact = player.primaryPosition === position ? 30 : player.secondaryPositions.includes(position) ? 14 : 0;
  switch (position) {
    case PrimaryPosition.GK:
      return exact + player.reflexes + player.shotStopping + player.handling + player.oneOnOnes;
    case PrimaryPosition.CB:
      return exact + player.marking + player.tackling + player.interceptions + player.strength;
    case PrimaryPosition.RB:
    case PrimaryPosition.LB:
      return exact + player.pace + player.tackling + player.crossing + player.workRate;
    case PrimaryPosition.CDM:
      return exact + player.positioning + player.interceptions + player.shortPassing + player.teamwork;
    case PrimaryPosition.CM:
      return exact + player.shortPassing + player.technique + player.decisions + player.workRate;
    case PrimaryPosition.CAM:
      return exact + player.creativity + player.technique + player.shortPassing + player.flair;
    case PrimaryPosition.RW:
    case PrimaryPosition.LW:
      return exact + player.pace + player.dribbling + player.crossing + player.flair;
    case PrimaryPosition.ST:
      return exact + player.finishing + player.offTheBall + player.composure + player.pace;
  }
}

/**
 * Applies the transformed identity and its deterministic prime-era mechanical
 * profile. Stable ids and contracts are preserved; no aggregate rating exists.
 */
export function applyIconicPlayerAliases(clubName: string, squad: Player[]): Player[] {
  const aliases = ICONIC_PLAYER_ALIASES[clubName];
  if (!aliases?.length) return squad;
  const available = new Set(squad.map((_, index) => index));

  for (const alias of aliases) {
    const compatible = [...available].filter((index) =>
      squad[index].primaryPosition === alias.position || squad[index].secondaryPositions.includes(alias.position),
    );
    // Never force a recognisable attacker/defender identity onto an unrelated
    // generated position. Standard squads contain every required position;
    // a malformed custom squad simply leaves that alias unused.
    const candidate = compatible
      .map((index) => ({ index, score: positionalScore(squad[index], alias.position) }))
      .sort((a, b) => b.score - a.score || a.index - b.index)[0];
    if (!candidate) continue;
    const selected = squad[candidate.index];
    selected.firstName = alias.firstName;
    selected.lastName = alias.lastName;
    const transformedName = `${alias.firstName} ${alias.lastName}`;
    const primeProfile = getIconicPrimeProfileByAlias(transformedName);
    if (!primeProfile) throw new Error(`Missing iconic prime profile for ${transformedName}.`);
    applyIconicPrimeProfile(selected, primeProfile);
    if (alias.playstyles?.length) {
      selected.playstyles = [...new Set([...alias.playstyles, ...selected.playstyles])].slice(0, 3);
    }
    available.delete(candidate.index);
  }
  return squad;
}
