/**
 * Name generation system — 15 fictional nationalities with name pools.
 * Each nationality has 60+ first names and 60+ last names.
 */

export interface NamePool {
  nationality: string;
  flag: string;
  firstNames: string[];
  lastNames: string[];
}

const split = (s: string): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of s.split(",")) {
    const n = raw.trim();
    // Guard against placeholder tokens sneaking into the data
    if (!n || n.includes("?") || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
};

const EN_FLAG = "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}";
const SC_FLAG = "\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}";

export const NAME_POOLS: Record<string, NamePool> = {
  Bretherland: {
    nationality: "Bretherland",
    flag: EN_FLAG,
    firstNames: split(
      "James,William,Oliver,Thomas,Harry,Jack,George,Charlie,Oscar,Jacob,Ethan,Liam,Noah,Lucas,Henry,Alfie,Freddie,Archie,Theo,Leo,Arthur,Finley,Daniel,Joseph,Samuel,Matthew,Alexander,Max,Edward,Ben,Alex,Ryan,Kyle,Callum,Scott,Grant,Murray,Craig,Duncan,Ewan,Patrick,Cole,Mason,Brock,Elliott,Reid,Blake,Dylan,Jonah,Toby,Harrison,Stanley,Walter,Percy,Rupert,Edwin,Cecil,Bertie,Harold,Sidney",
    ),
    lastNames: split(
      "Thompson,Richardson,Williamson,Baker,Wright,Mitchell,Cooper,Ward,Turner,Carter,Phillips,Bennett,Hughes,Price,Kelly,Foster,Powell,Sullivan,Palmer,Webster,Barnett,Chapman,Greenwood,Hunt,Jenkins,Norris,Osborne,Riley,Saunders,Shaw,Steele,Stone,Warren,Watts,Wheeler,Barnes,Bell,Burns,Carr,Dixon,Edwards,Fisher,Griffiths,Hamilton,Holland,Irving,Jefferson,Kerr,Marshall,Newton,Page,Reynolds,Shepherd,Stewart,Taylor,Vaughan,Whitfield,Yates,Hargreaves,Kirkby",
    ),
  },
  Valdoria: {
    nationality: "Valdoria",
    flag: "\u{1F1EA}\u{1F1F8}",
    firstNames: split(
      "Marco,Rafael,Esteban,Carlos,Miguel,Javier,Alejandro,Diego,Pablo,Sergio,Adrian,Alvaro,Iker,Unai,Hector,Oscar,Ruben,Ivan,Jesus,Angel,Bruno,Gonzalo,Ignacio,Mateo,Emilio,Ricardo,Fernando,Andres,Tomas,Nicolas,Vicente,Ramon,Enrique,Alonso,Baltasar,Cristobal,Domingo,Felix,Gabriel,Isaac,Joaquin,Leandro,Mauricio,Octavio,Raul,Salvador,Teodoro,Ulises,Victor,Yago,Agustin,Bautista,Emiliano,Facundo,Gustavo,Hernan,Julio,Kilian,Lorenzo,Mariano",
    ),
    lastNames: split(
      "Ferreira,Montoya,Delgado,Herrera,Navarro,Ortega,Pena,Quintana,Ramos,Serrano,Toledo,Urbina,Valdes,Zamora,Acosta,Bernal,Cordero,Duarte,Escudero,Fuentes,Gallardo,Hidalgo,Ibarra,Jimenez,Lara,Medina,Noguera,Oliva,Paz,Rosales,Salas,Torres,Uceda,Vargas,Yuste,Alcaraz,Bravo,Cabrera,Donoso,Espinosa,Franco,Gil,Hervas,Izquierdo,Juarez,Lombardo,Marin,Mena,Nunez,Ochoa,Paredes,Quevedo,Requena,Sandoval,Tejada,Urbano,Vega,Wenceslao,Ybarra,Zapata",
    ),
  },
  Azzuriland: {
    nationality: "Azzuriland",
    flag: "\u{1F1EE}\u{1F1F9}",
    firstNames: split(
      "Luca,Matteo,Gianluca,Alessandro,Andrea,Francesco,Marco,Gabriele,Davide,Simone,Antonio,Stefano,Fabio,Riccardo,Lorenzo,Nicolo,Edoardo,Tommaso,Christian,Daniele,Federico,Giovanni,Giuseppe,Salvatore,Vittorio,Umberto,Piero,Michele,Claudio,Roberto,Enrico,Alberto,Carlo,Dario,Emanuele,Filippo,Giorgio,Leandro,Massimo,Nando,Paolo,Raoul,Saverio,Tiziano,Ugo,Valerio,Walter,Beniamino,Ciro,Domenico,Ettore,Flavio,Gennaro,Lamberto,Marzio,Oreste,Pasquale,Quirino,Remo,Pierluigi",
    ),
    lastNames: split(
      "Morettini,Coletti,Bassi,Caruso,Esposito,Ferri,Gallo,Greco,Abate,Barbieri,Colombo,Fabbri,Giordano,Marchetti,Neri,Parisi,Riva,Santoro,Testa,Villa,Amato,Bellini,Cattaneo,Donati,Ferretti,Fontana,Grassi,Leone,Mancini,Olivieri,Pellegrini,Rinaldi,Serra,Tosi,Valentini,Bernardi,Coppola,Lanzini,Marino,Nugnes,Orlando,Pagano,Ricci,Simonetti,Tamburini,Ussello,Ventura,Zanetti,Benedetti,Caputo,D'Angelo,Falchi,Grasso,Martini,Putzu,Riccardi,Sordi,Taddei,Sabatini,Ranieri",
    ),
  },
  Gallonde: {
    nationality: "Gallonde",
    flag: "\u{1F1EB}\u{1F1F7}",
    firstNames: split(
      "Antoine,Julien,Pierre,Baptiste,Camille,Emile,Florian,Gautier,Hugo,Jules,Laurent,Mathis,Nicolas,Olivier,Paul,Quentin,Remi,Stephane,Thibault,Victor,Adrien,Bastien,Cedric,Damien,Etienne,Felix,Gaspard,Herve,Ismael,Jean,Lucas,Maxime,Romain,Sebastien,Thierry,Yannick,Arnaud,Bruno,Christophe,Dominique,Franck,Gregoire,Loic,Matthieu,Philippe,Raphael,Sylvain,Andre,Charlot,Didier,Edouard,Francis,Gaston,Henri,Jaques,Lionel,Marcel,Noel,Pascal,Roger",
    ),
    lastNames: split(
      "Beaumont,Lefevre,Moreau,Bertrand,Charpentier,Dubois,Dupont,Faure,Gaillard,Lambert,Masson,Mercier,Marchand,Pelletier,Perrin,Renard,Rousseau,Roussel,Sauvage,Schmitt,Vasseur,Blanc,Bonnet,Chevalier,Colin,Delaunay,Fabre,Garnier,Guerin,Joly,Langlois,Lemaitre,Ollivier,Pichon,Roche,Tissot,Vidal,Aubert,Barbier,Blanchard,Caron,Chauvin,Giraud,Leclerc,Marty,Paget,Prevost,Roy,Vernier,Ardoin,Bastide,Chastel,Delaunay,Gaudin,Hamon,Benoit,Chretien,Durand,Leblanc,Meunier,Maillard",
    ),
  },
  Schwarzland: {
    nationality: "Schwarzland",
    flag: "\u{1F1E9}\u{1F1EA}",
    firstNames: split(
      "Lukas,Max,Florian,Andreas,Benedikt,Christoph,Daniel,Elias,Fabian,Felix,Gregor,Hannes,Jonas,Leonard,Markus,Nico,Oliver,Paul,Roman,Simon,Thomas,Tobias,Ulrich,Viktor,Walter,Benjamin,Clemens,Dirk,Erik,Frank,Gerhard,Hans,Ingo,Jan,Kai,Lars,Moritz,Niklas,Pascal,Ralf,Sebastian,Stefan,Sven,Timo,Uwe,Wilhelm,Wolf,Dieter,Ernst,Friedrich,Georg,Heiko,Joachim,Karl,Lutz,Martin,Norbert,Otto,Rudolf,Reinhold",
    ),
    lastNames: split(
      "Steinmann,Vogler,Bauer,Becker,Braun,Dietrich,Ebert,Fischer,Frank,Friedrich,Gruber,Hahn,Hartmann,Heinrich,Herrmann,Hoffmann,Keller,Konig,Kraft,Kramer,Kuhn,Lange,Lehmann,Lorenz,Ludwig,Maier,Mayer,Meier,Moller,Neumann,Ott,Peters,Richter,Ritter,Sauer,Schmid,Schneider,Scholz,Schroder,Schulte,Schulz,Schumacher,Schwarz,Seidel,Sommer,Vogel,Wagner,Weber,Weiss,Werner,Winkler,Zimmermann,Bergmann,Dittrich,Falk,Gross,Hildebrandt,Kaiser,Klein,Kohl,Kruger",
    ),
  },
  Oranjeland: {
    nationality: "Oranjeland",
    flag: "\u{1F1F3}\u{1F1F1}",
    firstNames: split(
      "Daan,Sem,Jesse,Bram,Dirk,Erik,Finn,Gijs,Hendrik,Ivo,Joost,Kees,Luuk,Niels,Pim,Rens,Sander,Thijs,Ties,Wouter,Yoeri,Zeno,Arie,Bas,Casper,Dennis,Eelco,Geert,Henk,Jaap,Klaas,Mick,Pieter,Ruben,Stijn,Teun,Willem,Youp,Andre,Boaz,Carlo,Dylan,Edgar,Frits,Gert,Hugo,Joris,Kasper,Lennard,Marten,Olivier,Quintin,Rick,Sjoerd,Tobias,Ulrich,Vincent,Wessel,Frans,Gerard",
    ),
    lastNames: split(
      "van Hoorn,Bakker,de Vries,van Dijk,Jansen,de Boer,van den Berg,Visser,Smit,Meijer,Mulder,Bos,Vos,Hendriks,van Leeuwen,Dekker,Brouwer,Dijkstra,Gerritsen,Koster,Leenders,Martens,Prins,Roos,Schouten,Timmermans,Verhoeven,Willems,Wolters,Zwart,Aalbers,Beumer,Driessen,Evers,Haasnoot,Hoekstra,Kuiper,Molenaar,Reijnders,Rietveld,Slegers,Vermeulen,Willemsen,Ypma,Blom,Heemskerk,Hendrickx? ,Ketel,Knol,Langenberg,Manders,Polak,Scheepers,Snijders,Stoffels,Terpstra,Veldhuis,Verbeek,van der Laan,Witvliet,Zeeman",
    ),
  },
  Nordheim: {
    nationality: "Nordheim",
    flag: "\u{1F1F3}\u{1F1F4}",
    firstNames: split(
      "Erik,Lars,Magnus,Anders,Bjorn,Carl,Emil,Frej,Gunnar,Hakon,Ivar,Jesper,Knut,Leif,Mikkel,Nikolai,Olav,Rasmus,Sven,Torbjorn,Ulrik,Vidar,Aksel,Bastian,Einar,Finn,Frode,Hakan,Ingvar,Jarl,Kasper,Lennart,Mattis,Nils,Odd,Peder,Ragnar,Stig,Soren,Thorvald,Ulf,Viggo,Yngve,Orjan,Ake,Asbjorn,Bror,Dag,Even,Halvor,Jonas,Kjell,Olav,Sten,Thorbjorn,Yngvar,Bjarte,Haakon,Rune,Trond,Vegard",
    ),
    lastNames: split(
      "Lindqvist,Johanssen,Andersen,Bergstrom,Christiansen,Dahl,Eriksen,Fredriksen,Gustavsson,Hansen,Haugen,Iversen,Jacobsen,Jonsson,Karlsen,Kristensen,Larsen,Lund,Madsen,Nyberg,Olsen,Pedersen,Persson,Rasmussen,Sandberg,Solberg,Sorensen,Thomsen,Vestergaard,Wallin,Aberg,Bjork,Borg,Engman,Falk,Halvorsen,Hedlund,Holm,Lindholm,Lindgren,Mork,Nyman,Skov,Steen,Strand,Sundqvist,Vang,Wold,Zetterlund,Angstrom,Bard,Gustafson,Hakansson,Lindberg,Lundgren,Skoglund,Soderberg,Wikstrom,Fisker,Kindberg",
    ),
  },
  Campoverde: {
    nationality: "Campoverde",
    flag: "\u{1F1E7}\u{1F1F7}",
    firstNames: split(
      "Luciano,Diego,Thiago,Mateo,Juan,Facundo,Gonzalo,Nicolas,Santiago,Enzo,Matias,Agustin,Franco,Ignacio,Lisandro,Maxi,Emiliano,Leandro,Ariel,Cesar,Damian,Ezequiel,Gaston,Hector,Joaquin,Lautaro,Mauricio,Osvaldo,Quintin,Rodrigo,Sebastian,Tobias,Ulises,Valentin,Vinicius,Yamil,Zoilo,Ademir,Caio,Danilo,Edson,Felipe,Geraldo,Ivan,Kaique,Mauro,Neymar? ,Oswaldo,Ramon,Tiago,Vanderlei,Wesley,Yuri,Zé,Alan,Edinaldo,Geovane,Juninho,Wellington,Yago,Cleiton",
    ),
    lastNames: split(
      "Almeida,Andrade,Barros,Cardoso,Esteves,Goncalves,Guimaraes,Machado,Marques,Monteiro,Nascimento,Neves,Pinto,Queiroz,Ribeiro,Rocha,Sampaio,Tavares,Teixeira,Vieira,Arantes,Bittencourt,Diaz,Dominguez,Franco,Gutierrez,Lagos,Molina,Munoz,Ocampo,Peralta,Quiroga,Ramirez,Salcedo,Villalba,Yanez,Cabrera,Correa,Fernandez,Rojas,Sosa,Tello,Valdez,Zeballos,Acuna,Alvarez,Banega,Escobar,Gimenez,Ibarra,Ledesma,Maidana,Barcos,Caceres,Ferreyra,Gomez,Luna,Nunez,Prado,Vera",
    ),
  },
  Lusitana: {
    nationality: "Lusitana",
    flag: "\u{1F1F5}\u{1F1F9}",
    firstNames: split(
      "Joao,Pedro,Miguel,Tiago,Andre,Diogo,Duarte,Emanuel,Filipe,Goncalo,Hugo,Ines,Jorge,Luis,Manuel,Nuno,Paulo,Rafa,Rui,Tomas,Vasco,Vitor,Afonso,Bernardo,Dinis,Eduardo,Fabio,Gil,Henrique,Joaquim,Lourenco,Otavio,Ricardo,Salvador,Simao,Tito,Virgilio,Zacarias,Alexandre,Ernesto,Gustavo,Helio,Ismael,Leandro,Mario,Nelson,Oscar,Quintino,Sergio,Tarcisio,Urbano,Viriato,Wilson,Xavier,Yuri,Ze,Bento,Carlos,Helder,Augusto",
    ),
    lastNames: split(
      "Silva,Costa,Santos,Rodrigues,Nunes,Moreira,Cardoso,Correia,Cunha,Faria,Freitas,Lopes,Machado,Marques,Matos,Melo,Mendes,Moura,Nogueira,Pacheco,Queiroz,Ramalho,Rebelo,Reis,Rocha,Salgado,Sarmento,Simoes,Trindade,Valente,Varela,Vasconcelos,Veloso,Vicente,Xavier,Abreu,Almeida,Amaral,Andrade,Aragao,Bastos,Bento,Chaves,Coelho,Duarte,Esteves,Figueiredo,Fonseca,Gomes,Gouveia,Henriques,Inacio,Jesus,Barreto,Braga,Cabral,Dias,Guerra,Horta,Pires",
    ),
  },
  Slavonica: {
    nationality: "Slavonica",
    flag: "\u{1F1F7}\u{1F1F8}",
    firstNames: split(
      "Ivan,Dmitri,Luka,Aleksandar,Andrej,Boris,Danilo,Emil,Filip,Goran,Hrvoje,Igor,Jovan,Konstantin,Milan,Nikola,Oleg,Pavle,Sasa,Tomas,Uros,Yuri,Zoran,Bojan,Dragomir,Georgi,Mirko,Predrag,Radoslav,Simeon,Stevan,Veselin,Branko,Djordje,Franjo,Gojko,Horvat,Josip,Kresimir,Ljubomir,Nebojsa,Ognjen,Ratko,Slaven,Tihomir,Vladan,Zdravko,Aleksa,Branislav,Cedomir,Dragan,Boban,Dejan,Gligor,Milos,Srdan,Stjepan,Vojin,Lazar,Novak",
    ),
    lastNames: split(
      "Petrov,Novak,Kovacevic,Jankovic,Popovic,Stojanovic,Ilic,Pavlovic,Markovic,Djordjevic,Nikolic,Milosevic,Radovanovic,Tosic,Vukovic,Zdravkovic,Blagojevic,Cvijanovic,Dragic,Filipovic,Horvat,Knezevic,Lukic,Milic,Obradovic,Paunovic,Ristic,Simic,Todorovic,Vasic,Zivkovic,Babic,Bogdan,Cvetkovic,Djukic,Erceg,Hribar,Ignjatovic,Jakovljevic,Kolar,Mandic,Nenadic,Radic,Stankovic,Stevanovic,Tomic,Velickovic,Zeljko,Grabovic,Miladinovic,Antic,Cirkovic,Dimic,Gligoric,Jovanov,Kostic,Mirkovic,Pavkovic,Stojkovic,Vuckovic",
    ),
  },
  Caledonia: {
    nationality: "Caledonia",
    flag: SC_FLAG,
    firstNames: split(
      "Hamish,Callum,Fraser,Alistair,Angus,Blair,Cameron,Duncan,Ewan,Fergus,Gordon,Iain,Kenneth,Lachlan,Malcolm,Patrick,Ross,Struan,Torin,Wallace,Alasdair,Bruce,Finlay,Graeme,Innes,Murdoch,Rory,Stewart,Tavish,Aaron,Craig,Denholm,Gavin,Keith,Lorne,Neil,Niall,Ranald,Ualan,Wullie,Zander,Archibald,Bertie,Carlan? ,Dougal,Elphin? ,Fingal? ,Gilbert,Hector,Inglis,Lorne,Maldon? ,Niall,Osgood? ,Ranald,Somhairle? ,Tormod,Walter,Ysander? ,Aidan,Barnaby,Findlay,Laurence,Ruaridh,Douglas,Kirk,Norman,Andrew,Donald,Colin",
    ),
    lastNames: split(
      "MacLeod,Campbell,Grant,Murray,Robertson,Ferguson,MacDonald,Baxter,Boyle,Buchan,Cairns,Carmichael,Cochrane,Cullen,Dickson,Docherty,Elder,Fyfe,Galloway,Gilchrist,Hamilton,Hendry,Inglis,Jamieson,Kelso,Kinloch,Lamont,Lennox,Lyon,Maxwell,McAllister,McLean,Menzies,Muir,Ogilvie,Oliphant,Paisley,Ramsay,Sinclair,Skene,Turnbull,Wallace,Watt,Whyte,Wishart,Young,Fraser,Gordon,Johnston,Reid,Sutherland,Urquhart,Barbour,Lang,Munro,Aitken,Cowie,Falconer,Geddes,Horne",
    ),
  },
  Emeraldia: {
    nationality: "Emeraldia",
    flag: "\u{1F1EE}\u{1F1EA}",
    firstNames: split(
      "Sean,Connor,Liam,Aidan,Brendan,Ciaran,Declan,Diarmaid,Eoin,Fionn,Gearoid,Kieran,Lorcan,Malachy,Niall,Oisin,Padraig,Ruairi,Seamus,Tadhg,Tomas,Cian,Cormac,Eamon,Fergal,Garret,Iarla,Jarlath,Kaelan,Nevin,Peadar,Rian,Turlough,Cathal,Donnacha,Fintan,Gavan,Kian,Leon,Naoise,Owen,Paddy,Rory,Shane,Donal,Milo,Oscar,Finnian,Cormac? ,Dermot,Enda,Fintan,Garron? ,Hugh,Ivan? ,Jarlath? ,Lorcan? ,Mael? ,Oscar? ,Parsley? no,Dermot,Enda,Hugh,Colm,Aengus,Daithi,Donnchadh,Eoghan,Fiachra,Senan,Cillian,Muiris",
    ),
    lastNames: split(
      "O'Brien,Murphy,Kelly,Byrne,Walsh,Ryan,O'Sullivan,Doherty,Doyle,Fitzgerald,Gallagher,Joyce,Keane,Lynch,McDonagh,Nolan,Power,Quigley,Reilly,Tobin,Whelan,Cassidy,Devlin,Egan,Flynn,Hanlon,Irwin,Kilcoyne,Lennon,Molloy,O'Connell,O'Neill,Roche,Tierney,Boyle,McKenna,O'Rourke,McCabe,Delaney,Farrell,Gormley,Healy,Kavanagh,Malone,O'Hagan,O'Reilly,Redmond,Sheridan,Stack,Treacy,Clancy,Feeney,Cleary,Daly,Hickey,Kinsella,Lally,Mackey,Rafferty,Tully",
    ),
  },
  Helvetica: {
    nationality: "Helvetica",
    flag: "\u{1F1E8}\u{1F1ED}",
    firstNames: split(
      "Hans,Noah,Adrian,Beat,Claudio,Elias,Fabio,Gilles,Julian,Livio,Marco,Matthias,Michael,Reto,Sandro,Silvan,Urs,Werner,Yves,Alain,Armin,Bruno,Curdin,Dieter,Enzo,Ernst,Fabian,Fabrice,Franz,Giacomo,Gilbert,Heinz,Hugo,Joel,Jonas,Josef,Julius,Karl,Kilian,Loic,Lothar,Manuel,Nicolas,Olivier,Philippe,Rolf,Silvio,Stefan,Thierry,Wolfgang,Xaver,Yannick,Zeno,Gottfried,Heinrich,Rolf,Ueli,Kurt,Gotthard,Leopold,Ruedi",
    ),
    lastNames: split(
      "Muller,Weber,Schneider,Meyer,Wagner,Brunner,Bucher,Eberle,Egger,Frei,Gerber,Hess,Keller,Koller,Locher,Moser,Oberholzer,Pfister,Schmid,Schuler,Seiler,Steiner,Studer,Tanner,Walder,Wyss,Zimmermann,Zemp,Bernet,Carlen,Fankhauser,Graf,Hodel,Inauen,Jaeger,Kaufmann,Lehmann,Meier,Nidegger,Odermatt,Portmann,Roth,Suter,Urscheler,Vontobel,Zbinden,Aebi,Brunner,Flury,Hunziker,Bachmann,Baumann,Bischoff,Duerr,Fehr,Hediger,Iseli,Luthi,Widmer,Stutz,Schibli",
    ),
  },
  Anatolia: {
    nationality: "Anatolia",
    flag: "\u{1F1F9}\u{1F1F7}",
    firstNames: split(
      "Emre,Burak,Kerem,Ahmet,Alper,Cem,Deniz,Efe,Fatih,Gokhan,Hakan,Kaan,Levent,Mert,Onur,Ozan,Selim,Tolga,Umut,Volkan,Yasin,Zeki,Arda,Bora,Cenk,Doruk,Ege,Ferhat,Hamza,Cagatay,Cihan,Emir,Furkan,Idris,Muharrem,Necati,Omer,Rahmi,Sinan,Tuncay,Ufuk,Yavuz,Zahit,Nedim,Nuri,Orhan,Riza,Sami,Tarik,Ulvi,Vefa,Yusuf,Ziya,Erkan,Gursel,Metin,Bulent,Cuneyt,Serkan,Yigit",
    ),
    lastNames: split(
      "Yilmaz,Demir,Kaya,Sahin,Celik,Yildiz,Ozturk,Aydin,Ozdemir,Arslan,Dogan,Kilic,Aslan,Cetin,Kara,Koc,Kurt,Ozkan,Simsek,Polat,Korkmaz,Tekin,Aksoy,Akgun,Albayrak,Ates,Bilgin,Bulut,Duran,Gunes,Guler,Kaplan,Karaca,Mercan,Okumus,Oz,Sezer,Tas,Tuncer,Ucar,Ulusoy,Varol,Zeybek,Erdogan,Gundogdu,Isik,Toprak,Uslu,Yalcin,Sari,Maden,Nalbant,Peker,Bozkurt,Coskun,Erdem,Fidan,Karadeniz,Taskin,Gumus",
    ),
  },
  Hellenia: {
    nationality: "Hellenia",
    flag: "\u{1F1F7}\u{1F1F1}",
    firstNames: split(
      "Nikos,Giorgos,Dimitris,Alexandros,Anastasios,Andreas,Antonis,Christos,Eleftherios,Fotis,Georgios,Kostas,Lambros,Michalis,Nikolaos,Odysseas,Panagiotis,Petros,Konstantinos,Sotiris,Theodoros,Vangelis,Vasileios,Yiannis,Achilleas,Charalampos,Efthymios,Fragkos,Grigoris,Ilias,Kiriakos,Manolis,Prodromos,Spyros,Stavros,Thanasis,Yannis,Zacharias,Aggelos,Babis,Evangos,Haris,Iason,Kimon,Lefteris,Minas,Nikitas,Odysseas,Panos,Sakis,Apostolis,Vasos,Akis,Sifis,Manos,Takis,Mimis,Stamatis,Loukas,Stergios,Rallis",
    ),
    lastNames: split(
      "Papadopoulos,Andreou,Georgiou,Nikolaou,Papanikolaou,Vasileiou,Dimitriou,Christodoulou,Antoniou,Konstantinou,Michailou,Alexandrou,Ioannou,Theodorou,Charalambous,Economou,Karagiannis,Makris,Mavridis,Nikolaidis,Oikonomou,Panagiotopoulos,Papageorgiou,Petridis,Samaras,Sideris,Stavrou,Vlachos,Xenakis,Zervas,Chrysanthopoulos,Katsaros,Alexiou,Doukas,Gavalas,Kallas,Lekkas,Pappas,Roussos,Trikoupis,Zafiropoulos,Bellas,Dimitrakos,Adamopoulos,Anagnostopoulos,Fotiadis,Georgiadis,Grigoriou,Hatzis,Iatridis,Kalfas,Lambrou,Mitsou,Nikolakopoulos,Papadakis,Rizopoulos,Spanos,Tsiolis,Voutsas,Zoumboulis",
    ),
  },
};

export const NATIONALITIES = Object.keys(NAME_POOLS);

export const NATIONALITY_FLAGS: Record<string, string> = Object.fromEntries(
  Object.values(NAME_POOLS).map((p) => [p.nationality, p.flag]),
);

import type { SeededRNG } from "@/database/rng";

/**
 * Generate a random first + last name for a nationality.
 * Falls back to Bretherland for unknown nationalities.
 */
export function generateName(
  nationality: string,
  rng?: SeededRNG,
): { firstName: string; lastName: string } {
  const pool = NAME_POOLS[nationality] ?? NAME_POOLS.Bretherland;
  const pick = <T>(arr: T[]): T =>
    rng ? arr[Math.floor(rng.next() * arr.length)] : arr[Math.floor(Math.random() * arr.length)];
  return { firstName: pick(pool.firstNames), lastName: pick(pool.lastNames) };
}
