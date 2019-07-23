const request = require( "request" );
const puppeteer = require( "puppeteer" );

module.exports.encodeBase64 = function( string ) {
	if ( !string ) { return "error"; }
	const a1 = new Buffer.from( string );
	return a1.toString( "base64" );
};
module.exports.decodeBase64 = function( string ) {
	let a1 = "";
	try { a1 = new Buffer.from( string , "base64" ); }
	catch( e ) { console.log( "error decoding base64" ); console.log( string ); }
	return a1.toString();
};

function MAKE_REQUEST( url ) {
	return new Promise( async function( resolve , reject ) {
		try {
			request( url , async function ( err , response , body ) {
				if ( err ) { resolve("error"); return; }
				console.log( url + "\n\t--> RESPONSE_CODE = " + response.statusCode.toString() );
				if ( response.statusCode !== 200 ) {
					//console.log( "bad status code ... " );
					resolve( false );
					return;
				}
				else {
					resolve( body );
					return;
				}
			});
		}
		catch( error ) { console.log( error ); reject( error ); }
	});
}
module.exports.makeRequest = MAKE_REQUEST;


function MAKE_REQUEST_WITH_PUPPETEER( url ) {
	return new Promise( async function( resolve , reject ) {
		try {
			console.log( url );
			const browser = await puppeteer.launch({ headless: true , /* slowMo: 2000 */  });
			const page = await browser.newPage();
			await page.setViewport( { width: 1200 , height: 700 } );
			//await page.setJavaScriptEnabled( false );
			await page.goto( url , { timeout: ( 120 * 1000 ) , waitUntil: "networkidle0" } );
			//await page.waitFor( 6000 );
			const body = await page.content();
			await browser.close();
			//exec( "pkill -9 chrome" , { silent: true ,  async: false } );
			resolve( body );
			return;
		}
		catch( error ) { console.log( error ); reject( error ); return; }
	});
}
module.exports.makeRequestWithPuppeteer = MAKE_REQUEST_WITH_PUPPETEER;