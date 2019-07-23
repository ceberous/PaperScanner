const fs = require( "fs" );

const RMU = require( "redis-manager-utils" );
const pAll = require( "p-all" );

const MakeRequest = require( "../utils/generic.js" ).makeRequest;
const MakeRequestWithPuppeteer = require( "../utils/generic.js" ).makeRequestWithPuppeteer;
const Sleep = require( "../utils/generic.js" ).sleep;
const EncodeB64 = require( "../utils/generic.js" ).encodeBase64;

const DX_DOI_BASE_URL = require( "../CONSTANTS/generic.js" ).DX_DOI_BASE_URL;
const SCI_HUB_BASE_URL = require( "../CONSTANTS/generic.js" ).SCI_HUB_BASE_URL;


// 1.) Get List of PubMedId's ***published *** in search interval
// ===============================================================
function generate_search_url( terms , window ) {
	let today = new Date();
	today.setDate( today.getDate() + 30 );
	const today_year = today.getFullYear();
	const today_month = ( today.getMonth() + 1 );
	const today_day = today.getDate();

	let previous = new Date();
	previous.setDate( previous.getDate() - window ); // Search Previous 'Window' Number of Days
	const previous_year = previous.getFullYear().toString();
	const previous_month = ( previous.getMonth() + 1 );
	const previous_day = previous.getDate();

	let url = "http://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=%28%28%28";
	const final_term = terms.length - 1;
	for ( let i = 0; i < terms.length; ++i ) {
		url = url + terms[ i ] + "%5BTitle/Abstract%5D%29+AND+%28%22";
		url = url + previous_year + "%2F" + previous_month + "%2F" + previous_day + "%22%5BDate+-+Publication%5D+%3A+%22";
		url = url + today_year + "%2F" + today_month + "%2F" + today_day + "%22%5BDate+-+Publication%5D%29%29";
		if ( i !== final_term ) { url = url + "+OR+"; }
	}
	url = url + "&retmode=json&retmax=1000";
	return url;
}
function gather_pubmed_ids( config ) {
	return new Promise( async function( resolve , reject ) {
		try {
			if ( !config ) { resolve( false ); return; }
			const search_url = generate_search_url( config.terms , config.window );
			let pubmed_ids = await MakeRequest( search_url );
			if ( !pubmed_ids ) { resolve( false ); return; }
			let parsed;
			try {
				parsed = JSON.parse( pubmed_ids );
			}
			catch( e ) { console.log( e ); console.log( parsed ); resolve( false ); return; }
			pubmed_ids = parsed;
			if ( !pubmed_ids[ "esearchresult" ] ) { resolve( false ); return; }
			if ( !pubmed_ids[ "esearchresult" ][ "idlist" ] ) { resolve( false ); return; }
			pubmed_ids = pubmed_ids[ "esearchresult" ][ "idlist" ];
			resolve( pubmed_ids );
			return;
		}
		catch( error ) { console.log( error ); reject( error ); return; }
	});
}
// 1.) Get List of PubMedId's ***published *** in search interval
// ===============================================================


// 3.) Gather "meta" data about each of them - via JSON endpoint
// =============================================================
const NCBI_NIH_ARTICLE_BASE_URL = "https://www.ncbi.nlm.nih.gov/pubmed/";
const PUB_MED_API_BASE_URL = "https://api.altmetric.com/v1/pmid/";
function get_meta_data_from_nih( pubmed_id , wDOIOnly ) {
	return new Promise( async function( resolve , reject ) {
		try {
			const url = NCBI_NIH_ARTICLE_BASE_URL + pubmed_id;
			console.log( "\t --> Cherrio.js --> " + url );

			let result = {
				pmid: pubmed_id ,
				mainURL: `${ NCBI_NIH_ARTICLE_BASE_URL }${ pubmed_id }` ,
				title: undefined ,
				doi: undefined ,
				doiB64: undefined ,
				scihubURL: undefined ,
			}

			let body = await MakeRequest( url );
			let failed = false;
			try { var $ = cheerio.load( body ); }
			catch( e ) { failed = true; }
			if ( failed ) {
				//fs.writeFileSync( "nih_testing.txt", body );

				// Find Title
				let title = body.split( 'class="cit"' )[ 1 ];
				title = title.split( 'class="afflist"' )[ 0 ];
				title = title.split( "<h1>" )[ 1 ];
				title = title.split( "</h1>" )[ 0 ];
				//console.log( title );
				result.title = title;

				// Find DOI
				let test = body.toLowerCase();
				test = test.replace( /\s/g , '' ); // Remove ALL White Space
				const doi_re = new RegExp( 'http' , 'gi' );
				let doi_indexes = new Array()
				while ( doi_re.exec( test ) ){
					doi_indexes.push( doi_re.lastIndex );
				}
				let possible_dois = [];
				for ( let i = 0; i < doi_indexes.length - 1; ++i ) {
					let item = test.substring( doi_indexes[ i ] , doi_indexes[ i + 1 ] );
					if ( item.indexOf( "doi:" ) < 0 ) { continue; }
					item = item.split( "doi:" )[ 1 ];
					item = item.split( '"' )[ 0 ];
					item = item.split( '<' )[ 0 ];
					item = item.trim();
					if ( item[ item.length - 1 ] === "." ) { item = item.substring( 0 , item.length - 1 ) }
					possible_dois.push( item );
				}
				//console.log( possible_dois );
				if ( !possible_dois[ 0 ] ) { resolve( pubmed_id ); return; }
				console.log( "\t\t--> " + possible_dois[ 0 ] );
				result.doi = possible_dois[ 0 ];
				result.doiB64 = EncodeB64( possible_dois[ 0 ] );
				result.scihubURL = SCI_HUB_BASE_URL + possible_dois[ 0 ];
				resolve( result );
				return;
			}

			let doi = null;

			let title = $( ".rprt.abstract" ).find( "h1" );
			title = $( title[0] ).text();
			result.title = title;
			//console.log( title );

			let doi_text = $( 'div[class="cit"]' ).text();
			let doi_start = doi_text.indexOf( "doi:" );
			if ( doi_start !== -1 ) {
				doi_text = doi_text.substring( ( doi_start + 5 ) , ( doi_text.length - 1 ) );
				//console.log( doi_text );
				doi_text = doi_text.split( " " )[0];
				doi_text = doi_text.replace( /\s/g , "" );
				if ( doi_text[ doi_text.length - 1 ] === "." ) {
					doi_text = doi_text.substring( 0 , ( doi_text.length - 1 ) );
				}
				doi = doi_text;
			}
			else {
				$( "a" ).each( function () {
					let id = $( this ).attr( "href" );
					doi = id.substring( 0 , 10 );
					if ( doi === "//doi.org/" ) {
						doi = id.substring( 10 , id.length );
						console.log( "doi found in URL ..." );
						console.log( id );
					}
				});
			}

			console.log( "\t\t--> " + doi );
			if ( wDOIOnly ) { resolve( doi ); return; }
			if ( doi ) {
				if ( doi.length > 3 ) {
					if ( doi !== "/home/abou" ) {
						result[ "doi" ] = doi;
						if ( !isNaN( doi[ 0 ] ) && !isNaN( doi[ 1 ] ) ) {
							result[ "doiB64" ] = EncodeB64( doi );
							result[ "scihubURL" ] = SCI_HUB_BASE_URL + doi;
						}
						else { result[ "doiB64" ] = EncodeB64( result.mainURL ); }
					}
				}
			}
			resolve( result );
		}
		catch( error ) { console.log( error ); reject( error ); }
	});
}
function get_meta_data_from_altmetric( pubmed_id ) {
	return new Promise( async function( resolve , reject ) {
		try {
			const url = PUB_MED_API_BASE_URL + pubmed_id;
			let body = await MakeRequest( url );
			if ( !body ) { resolve( pubmed_id ); return;}
			try { body = JSON.parse( body ); }
			catch( e ) { resolve( pubmed_id ); return; }
			let finalOBJ = {
				pmid: pubmed_id ,
				mainURL: `${ NCBI_NIH_ARTICLE_BASE_URL }${ pubmed_id }` ,
				title: undefined ,
				doi: undefined ,
				doiB64: undefined ,
				scihubURL: undefined ,
			};
			if ( body[ "title" ] ) { finalOBJ.title = body[ "title" ]; }
			if ( body[ "doi" ] ) {
				console.log( "\t\t--> " + body[ "doi" ] );
				finalOBJ.doi = body[ "doi" ];
				finalOBJ.doiB64 = EncodeB64( body[ "doi" ] );
				finalOBJ.scihubURL = SCI_HUB_BASE_URL + body[ "doi" ];
			}
			if ( !finalOBJ[ "doiB64" ] ) { resolve( pubmed_id ); return; }
			resolve( finalOBJ );
		}
		catch( err ) { console.log(err); reject( err ); }
	});
}
function get_meta_data( pubmed_ids ) {
	return new Promise( async function( resolve , reject ) {
		try {
			if ( !pubmed_ids ) { return []; }
			if ( pubmed_ids.length < 1 ) { return []; }

			const altmetric_batch = pubmed_ids.map( x => () => get_meta_data_from_altmetric( x ) );
			let altmetric_results = await pAll( altmetric_batch /* , { concurrency: 5 } */ );

			const altmetric_failed = altmetric_results.filter( x => x[ "doi" ] === undefined );
			altmetric_results = altmetric_results.filter( x => x[ "doi" ] !== undefined );

			const nih_batch = altmetric_failed.map( x => () => get_meta_data_from_nih( x ) );
			let nih_results = await pAll( nih_batch /* , { concurrency: 1 } */ );

			const nih_failed = nih_results.filter( x => x[ "doi" ] === undefined );
			nih_results = nih_results.filter( x => x[ "doi" ] !== undefined );

			resolve({
				success: [ ...altmetric_results , ...nih_results ] ,
				failed: nih_failed
			});
			return;
		}
		catch( error ) { console.log( error ); reject( error ); return; }
	});
}
// 3.) Gather "meta" data about each of them - via JSON endpoint
// =============================================================


// SEARCH( { terms: [ "autism" , "autistic" ] , window: 60 } );
function SEARCH( config ) {
	return new Promise( async function( resolve , reject ) {
		try {
			// Init
			let db = new RMU( 1 );
			await db.init();

			// 1.) Get List of PubMedId's ***published *** in search interval
			const pubmed_ids = await gather_pubmed_ids( config );
			if ( !pubmed_ids ) { resolve( false ); return; }

			// 2.) Filter From already 'Tracked' PubMed-Article-IDS in Redis
			const key_terms = EncodeB64( config.terms.join( "***" ) );
			const key = "PUBMED.IDS.ALREADY_TRACKED.SEARCH." + key_terms;
			console.log( key );
			const filtered = await db.setAddArrayWithFilter( "PUBMED.TEMP" , key , pubmed_ids );
			if ( !filtered ) { db.quit(); resolve( [] ); return; }
			if ( filtered.length < 1 ) { db.quit(); resolve( [] ); return; }

			// 3.) Gather "meta" data about each pubmed id
			let results = await get_meta_data( filtered );

			// 4.) Store Successful Results into 'Tracked' Key
			await db.setSetFromArray( key , results.success.map( x => x.pmid ) );

			// 5.) Delete 'TEMP' Key
			await db.keyDel( "PUBMED.TEMP" );

			// 6.) Update Global DOIS
			await db.setSetFromArray( "DOIS" , results.success.map( x => x.doiB64 ) );

			// 7.) Save Meta Data DOI Info to Redis
			// const new_dois_batch = results.success.map( x => [ "set" , "DOI." + x.doiB64 , JSON.stringify( x.title ) ] );
			// await db.keySetMulti( new_dois_batch );

			// Cleanup
			db.quit();

			resolve( results );
			return;
		}
		catch( error ) { console.log( error ); resolve( [] ); return; }
	});
}
module.exports.search = SEARCH;

function TEST( config ) {
	return new Promise( async function( resolve , reject ) {
		try {
			let data = await get_meta_data_from_nih( "30513048" )
			resolve( data );
			return;
		}
		catch( error ) { console.log( error ); reject( error ); return; }
	});
}
module.exports.test = TEST;