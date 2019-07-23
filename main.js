const process = require( "process" );

process.on( "unhandledRejection" , function( reason , p ) {
	console.error( reason, "Unhandled Rejection at Promise" , p );
	console.trace();
});
process.on( "uncaughtException" , function( err ) {
	console.error( err , "Uncaught Exception thrown" );
	console.trace();
});

( async ()=> {
	let result = await require( "./scanners/pubmed.js" ).search({
		terms: [ "autism" , "autistic" ] ,
		window: 1
	});
	//let result = await require( "./scanners/pubmed.js" ).test({});
	console.log( result );
	process.exit( 1 );
})();