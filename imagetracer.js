/*
	imagetracer.js version 1.2.6
	Simple raster image tracer and vectorizer written in JavaScript.
	andras@jankovics.net
*/

/*

The Unlicense / PUBLIC DOMAIN

This is free and unencumbered software released into the public domain.

Anyone is free to copy, modify, publish, use, compile, sell, or
distribute this software, either in source code form or as a compiled
binary, for any purpose, commercial or non-commercial, and by any
means.

In jurisdictions that recognize copyright laws, the author or authors
of this software dedicate any and all copyright interest in the
software to the public domain. We make this dedication for the benefit
of the public at large and to the detriment of our heirs and
successors. We intend this dedication to be an overt act of
relinquishment in perpetuity of all present and future rights to this
software under copyright law.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR
OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.

For more information, please refer to http://unlicense.org/

*/

(function(){ 'use strict';

function ImageTracer(){
	var _this = this;

	this.versionnumber = '1.2.6',
	
	////////////////////////////////////////////////////////////
	//
	//  API
	//
	////////////////////////////////////////////////////////////
	
	// Loading an image from a URL, tracing when loaded,
	// then executing callback with the scaled svg string as argument
	this.imageToSVG = function( url, callback, options ){
		options = _this.checkoptions(options);
		// loading image, tracing and callback
		_this.loadImage(
			url,
			function(canvas){
				callback(
					_this.imagedataToSVG( _this.getImgdata(canvas), options )
				);
			},
			options
		);
	},// End of imageToSVG()
	
	// Tracing imagedata, then returning the scaled svg string
	this.imagedataToSVG = function( imgd, options ){
		options = _this.checkoptions(options);
		// tracing imagedata
		var td = _this.imagedataToTracedata( imgd, options );
		// returning SVG string
		return _this.getsvgstring(td, options);
	},// End of imagedataToSVG()
	
	// Loading an image from a URL, tracing when loaded,
	// then executing callback with tracedata as argument
	this.imageToTracedata = function( url, callback, options ){
		options = _this.checkoptions(options);
		// loading image, tracing and callback
		_this.loadImage(
				url,
				function(canvas){
					callback(
						_this.imagedataToTracedata( _this.getImgdata(canvas), options )
					);
				},
				options
		);
	},// End of imageToTracedata()
	
	// Tracing imagedata, then returning tracedata (layers with paths, palette, image size)
	this.imagedataToTracedata = function( imgd, options ){
		options = _this.checkoptions(options);
		
		// 1. Color quantization
		var ii = _this.colorquantization( imgd, options );
		
		if(options.layering === 2 || options.hierarchical || options.layering === 'hierarchical'){
			return _this.hierarchicalTracedata( imgd, ii, options );
		}else if(options.layering === 0){// Sequential layering
			
			// create tracedata object
			var tracedata = {
				layers : [],
				palette : ii.palette,
				width : ii.array[0].length-2,
				height : ii.array.length-2
			};
			
			// Loop to trace each color layer
			for(var colornum=0; colornum<ii.palette.length; colornum++){
				
				// layeringstep -> pathscan -> internodes -> batchtracepaths
				var tracedlayer =
					_this.batchtracepaths(
							
						_this.internodes(
								
							_this.pathscan(
								_this.layeringstep( ii, colornum ),
								options.pathomit,
								options
							),
							
							options
							
						),
						
						options.ltres,
						options.qtres,
						options
					);
				
				// adding traced layer
				tracedata.layers.push(tracedlayer);
				
			}// End of color loop
			
		}else{// Parallel layering
			// 2. Layer separation and edge detection
			var ls = _this.layering( ii );
			
			// Optional edge node visualization
			if(options.layercontainerid){ _this.drawLayers( ls, _this.specpalette, options.scale, options.layercontainerid ); }
			
			// 3. Batch pathscan
			var bps = _this.batchpathscan( ls, options.pathomit, options );
			
			// 4. Batch interpollation
			var bis = _this.batchinternodes( bps, options );
			
			// 5. Batch tracing and creating tracedata object
			var tracedata = {
				layers : _this.batchtracelayers( bis, options.ltres, options.qtres, options ),
				palette : ii.palette,
				width : imgd.width,
				height : imgd.height
			};
			
		}// End of parallel layering
		
		// return tracedata
		return tracedata;
		
	},// End of imagedataToTracedata()
	
	this.optionpresets = {
		'default': {
			
			// Tracing
			corsenabled : false,
			ltres : 1,
			qtres : 1,
			pathomit : 8,
			speckleradius : 1.5,
			rightangleenhance : true,
			curvealgorithm : 'potrace',
			edgestyle : 'organic',
			hierarchical : false,
			edgesensitivity : 35,
			edgeblur : 0,
			edgegapclose : 1,
			edgethinning : true,
			minregionarea : 4,
			smoothsteps : 2,
			alphamax : 1.0,
			opttolerance : 0.8,
			
			// Color quantization
			colorsampling : 2,
			numberofcolors : 16,
			mincolorratio : 0,
			colorquantcycles : 3,
			distancemetric : 'perceptual',
			maxiterations : 10,
			
			// Layering method
			layering : 0,
			
			// SVG rendering
			strokewidth : 1,
			linefilter : false,
			scale : 1,
			roundcoords : 1,
			viewbox : false,
			desc : false,
			lcpr : 0,
			qcpr : 0,
			
			// Blur
			blurradius : 0,
			blurdelta : 20
			
		},
		'posterized1': { colorsampling:0, numberofcolors:2 },
		'posterized2': { numberofcolors:4, blurradius:5 },
		'curvy': { ltres:0.01, linefilter:true, rightangleenhance:false },
		'sharp': { qtres:0.01, linefilter:false },
		'detailed': { pathomit:0, roundcoords:2, ltres:0.5, qtres:0.5, numberofcolors:64 },
		'smoothed': { blurradius:5, blurdelta: 64 },
		'grayscale': { colorsampling:0, colorquantcycles:1, numberofcolors:7 },
		'fixedpalette': { colorsampling:0, colorquantcycles:1, numberofcolors:27 },
		'randomsampling1': { colorsampling:1, numberofcolors:8 },
		'randomsampling2': { colorsampling:1, numberofcolors:64 },
		'artistic1': { colorsampling:0, colorquantcycles:1, pathomit:0, blurradius:5, blurdelta: 64, ltres:0.01, linefilter:true, numberofcolors:16, strokewidth:2 },
		'artistic2': { qtres:0.01, colorsampling:0, colorquantcycles:1, numberofcolors:4, strokewidth:0 },
		'artistic3': { qtres:10, ltres:10, numberofcolors:8 },
		'artistic4': { qtres:10, ltres:10, numberofcolors:64, blurradius:5, blurdelta: 256, strokewidth:2 },
		'posterized3': { ltres: 1, qtres: 1, pathomit: 20, rightangleenhance: true, colorsampling: 0, numberofcolors: 3,
			mincolorratio: 0, colorquantcycles: 3, blurradius: 3, blurdelta: 20, strokewidth: 0, linefilter: false,
			roundcoords: 1, pal: [ { r: 0, g: 0, b: 100, a: 255 }, { r: 255, g: 255, b: 255, a: 255 } ] }
	},// End of optionpresets
	
	// creating options object, setting defaults for missing values
	this.checkoptions = function(options){
		options = options || {};
		// Option preset
		if(typeof options === 'string'){
			options = options.toLowerCase();
			if( _this.optionpresets[options] ){ options = _this.optionpresets[options]; }else{ options = {}; }
		}
		// Defaults
		var ok = Object.keys(_this.optionpresets['default']);
		for(var k=0; k<ok.length; k++){
			if(!options.hasOwnProperty(ok[k])){ options[ok[k]] = _this.optionpresets['default'][ok[k]]; }
		}
		// options.pal is not defined here, the custom palette should be added externally: options.pal = [ { 'r':0, 'g':0, 'b':0, 'a':255 }, {...}, ... ];
		// options.layercontainerid is not defined here, can be added externally: options.layercontainerid = 'mydiv'; ... <div id="mydiv"></div>
		return options;
	},// End of checkoptions()
	
	////////////////////////////////////////////////////////////
	//
	//  Vectorizing functions
	//
	////////////////////////////////////////////////////////////
	
	// 1. Color quantization
	// Using a form of k-means clustering repeatead options.colorquantcycles times. http://en.wikipedia.org/wiki/Color_quantization
	this.colorquantization = function( imgd, options ){
		var arr = [], idx=0, cd,cdl,ci, paletteacc = [], pixelnum = imgd.width * imgd.height, i, j, k, cnt, palette;
		
		// imgd.data must be RGBA, not just RGB
		if( imgd.data.length < pixelnum * 4 ){
			var newimgddata = new Uint8ClampedArray(pixelnum * 4);
			for(var pxcnt = 0; pxcnt < pixelnum ; pxcnt++){
				newimgddata[pxcnt*4  ] = imgd.data[pxcnt*3  ];
				newimgddata[pxcnt*4+1] = imgd.data[pxcnt*3+1];
				newimgddata[pxcnt*4+2] = imgd.data[pxcnt*3+2];
				newimgddata[pxcnt*4+3] = 255;
			}
			imgd.data = newimgddata;
		}// End of RGBA imgd.data check
		
		// Filling arr (color index array) with -1
		for( j=0; j<imgd.height+2; j++ ){ arr[j]=[]; for(i=0; i<imgd.width+2 ; i++){ arr[j][i] = -1; } }
		
		// Use custom palette if pal is defined or sample / generate custom length palette
		if(options.pal){
			palette = options.pal;
		}else if(options.colorsampling === 0){
			palette = _this.generatepalette(options.numberofcolors);
		}else if(options.colorsampling === 1){
			palette = _this.samplepalette( options.numberofcolors, imgd );
		}else if(options.colorsampling === 2){
			palette = _this.samplepalette2( options.numberofcolors, imgd );
		}else{
			palette = _this.kMeansColorQuantization( imgd, options ).palette;
		}
		
		// Selective Gaussian blur preprocessing
		if( options.blurradius > 0 ){ imgd = _this.blur( imgd, options.blurradius, options.blurdelta ); }
		
		// Repeat clustering step options.colorquantcycles times
		for( cnt=0; cnt < options.colorquantcycles; cnt++ ){
			
			// Average colors from the second iteration
			if(cnt>0){
				// averaging paletteacc for palette
				for( k=0; k < palette.length; k++ ){
					
					// averaging
					if( paletteacc[k].n > 0 ){
						palette[k] = {  r: Math.floor( paletteacc[k].r / paletteacc[k].n ),
										g: Math.floor( paletteacc[k].g / paletteacc[k].n ),
										b: Math.floor( paletteacc[k].b / paletteacc[k].n ),
										a:  Math.floor( paletteacc[k].a / paletteacc[k].n ) };
					}
					
					// Randomizing a color, if there are too few pixels and there will be a new cycle
					if( ( paletteacc[k].n/pixelnum < options.mincolorratio ) && ( cnt < options.colorquantcycles-1 ) ){
						palette[k] = {  r: Math.floor(Math.random()*255),
										g: Math.floor(Math.random()*255),
										b: Math.floor(Math.random()*255),
										a: Math.floor(Math.random()*255) };
					}
					
				}// End of palette loop
			}// End of Average colors from the second iteration
			
			// Reseting palette accumulator for averaging
			for( i=0; i < palette.length; i++ ){ paletteacc[i] = { r:0, g:0, b:0, a:0, n:0 }; }
			
			// loop through all pixels
			for( j=0; j < imgd.height; j++ ){
				for( i=0; i < imgd.width; i++ ){
					
					// pixel index
					idx = (j*imgd.width+i)*4;
					
					// find closest color from palette by measuring color distance between this pixel and all palette colors
					ci=0; cdl = Infinity;
					for( k=0; k<palette.length; k++ ){
						if(options.distancemetric === 'euclidean'){
							var dr = palette[k].r - imgd.data[idx  ],
							    dg = palette[k].g - imgd.data[idx+1],
							    db = palette[k].b - imgd.data[idx+2],
							    da = palette[k].a - imgd.data[idx+3];
							cd = dr*dr + dg*dg + db*db + da*da;
						}else if(options.distancemetric === 'perceptual'){
							var dr = palette[k].r - imgd.data[idx  ],
							    dg = palette[k].g - imgd.data[idx+1],
							    db = palette[k].b - imgd.data[idx+2],
							    da = palette[k].a - imgd.data[idx+3];
							var rmean = (palette[k].r + imgd.data[idx  ]) >> 1;
							cd = (((512 + rmean) * dr * dr) >> 8) + 4 * dg * dg + (((767 - rmean) * db * db) >> 8) + 3 * da * da;
						}else{
							cd = 
								( palette[k].r > imgd.data[idx  ] ? palette[k].r - imgd.data[idx  ] : imgd.data[idx  ] - palette[k].r ) +
								( palette[k].g > imgd.data[idx+1] ? palette[k].g - imgd.data[idx+1] : imgd.data[idx+1] - palette[k].g ) +
								( palette[k].b > imgd.data[idx+2] ? palette[k].b - imgd.data[idx+2] : imgd.data[idx+2] - palette[k].b ) +
								( palette[k].a > imgd.data[idx+3] ? palette[k].a - imgd.data[idx+3] : imgd.data[idx+3] - palette[k].a );
						}
						
						// Remember this color if this is the closest yet
						if(cd<cdl){ cdl = cd; ci = k; }
						
					}// End of palette loop
					
					// add to palettacc
					paletteacc[ci].r += imgd.data[idx  ];
					paletteacc[ci].g += imgd.data[idx+1];
					paletteacc[ci].b += imgd.data[idx+2];
					paletteacc[ci].a += imgd.data[idx+3];
					paletteacc[ci].n++;
					
					// update the indexed color array
					arr[j+1][i+1] = ci;
					
				}// End of i loop
			}// End of j loop
			
		}// End of Repeat clustering step options.colorquantcycles times
		
		return { array:arr, palette:palette };
		
	},// End of colorquantization()

	// K-Means clustering algorithm for color selection
	this.kMeansColorQuantization = function( imgd, options ){
		options = options || {};
		var k = Math.max(2, options.numberofcolors || 8);
		var maxIterations = Math.max(1, options.maxiterations || 10);
		var initMethod = options.initmethod || 'kmeans_plus';
		var metric = options.distancemetric || 'perceptual';
		var sampleTarget = typeof options.samplesize === 'number' ? options.samplesize : (
			options.samplesize === 'fast' ? 10000 :
			options.samplesize === 'high' ? 100000 : 30000
		);

		var data = imgd.data;
		var totalPixels = imgd.width * imgd.height;

		// 1. Collect valid non-transparent pixels
		var step = Math.max(1, Math.floor(totalPixels / sampleTarget));
		var sampleR = [], sampleG = [], sampleB = [];
		for( var p = 0; p < totalPixels; p += step ){
			var pIdx = p * 4;
			if( data[pIdx + 3] >= 32 ){
				sampleR.push(data[pIdx]);
				sampleG.push(data[pIdx + 1]);
				sampleB.push(data[pIdx + 2]);
			}
		}

		if( sampleR.length < k && step > 1 ){
			sampleR = []; sampleG = []; sampleB = [];
			for( var p = 0; p < totalPixels; p++ ){
				var pIdx = p * 4;
				if( data[pIdx + 3] >= 32 ){
					sampleR.push(data[pIdx]);
					sampleG.push(data[pIdx + 1]);
					sampleB.push(data[pIdx + 2]);
				}
			}
		}

		var numSamples = sampleR.length;
		if( numSamples === 0 ){
			var fallback = [];
			for( var f = 0; f < k; f++ ){
				var val = Math.floor((f / (k - 1 || 1)) * 255);
				fallback.push({ r: val, g: val, b: val, a: 255 });
			}
			return { palette: fallback };
		}

		var actualK = Math.min(k, numSamples);

		function colorDistanceSq( r1, g1, b1, r2, g2, b2 ){
			var dr = r1 - r2;
			var dg = g1 - g2;
			var db = b1 - b2;
			if( metric === 'perceptual' ){
				var rmean = (r1 + r2) >> 1;
				return (((512 + rmean) * dr * dr) >> 8) + 4 * dg * dg + (((767 - rmean) * db * db) >> 8);
			} else if( metric === 'manhattan' ){
				var man = (dr < 0 ? -dr : dr) + (dg < 0 ? -dg : dg) + (db < 0 ? -db : db);
				return man * man;
			} else {
				return dr * dr + dg * dg + db * db;
			}
		}

		// 2. Initialize Centroids
		var centroids = [];
		if( initMethod === 'kmeans_plus' ){
			var firstIdx = Math.floor(Math.random() * numSamples);
			centroids.push({ r: sampleR[firstIdx], g: sampleG[firstIdx], b: sampleB[firstIdx], a: 255 });

			var minDistSq = new Float64Array(numSamples);
			for( var i = 0; i < numSamples; i++ ){
				minDistSq[i] = colorDistanceSq(sampleR[i], sampleG[i], sampleB[i], centroids[0].r, centroids[0].g, centroids[0].b);
			}

			for( var c = 1; c < actualK; c++ ){
				var sumDistSq = 0;
				for( var i = 0; i < numSamples; i++ ){
					sumDistSq += minDistSq[i];
				}

				if( sumDistSq <= 0 ){
					var randIdx = Math.floor(Math.random() * numSamples);
					centroids.push({ r: sampleR[randIdx], g: sampleG[randIdx], b: sampleB[randIdx], a: 255 });
				} else {
					var threshold = Math.random() * sumDistSq;
					var cumSum = 0;
					var chosenIdx = numSamples - 1;
					for( var i = 0; i < numSamples; i++ ){
						cumSum += minDistSq[i];
						if( cumSum >= threshold ){
							chosenIdx = i;
							break;
						}
					}
					centroids.push({ r: sampleR[chosenIdx], g: sampleG[chosenIdx], b: sampleB[chosenIdx], a: 255 });

					for( var i = 0; i < numSamples; i++ ){
						var d = colorDistanceSq(sampleR[i], sampleG[i], sampleB[i], centroids[c].r, centroids[c].g, centroids[c].b);
						if( d < minDistSq[i] ){
							minDistSq[i] = d;
						}
					}
				}
			}
		} else if( initMethod === 'grid' ){
			for( var c = 0; c < actualK; c++ ){
				var gIdx = Math.floor((c + 0.5) * numSamples / actualK);
				centroids.push({ r: sampleR[gIdx], g: sampleG[gIdx], b: sampleB[gIdx], a: 255 });
			}
		} else {
			for( var c = 0; c < actualK; c++ ){
				var rIdx = Math.floor(Math.random() * numSamples);
				centroids.push({ r: sampleR[rIdx], g: sampleG[rIdx], b: sampleB[rIdx], a: 255 });
			}
		}

		// 3. Iterative clustering (Lloyd's Algorithm)
		var clusterSumR = new Float64Array(actualK);
		var clusterSumG = new Float64Array(actualK);
		var clusterSumB = new Float64Array(actualK);
		var clusterCount = new Int32Array(actualK);

		for( var iter = 0; iter < maxIterations; iter++ ){
			clusterSumR.fill(0);
			clusterSumG.fill(0);
			clusterSumB.fill(0);
			clusterCount.fill(0);

			for( var i = 0; i < numSamples; i++ ){
				var sr = sampleR[i], sg = sampleG[i], sb = sampleB[i];
				var bestDist = Infinity;
				var bestC = 0;
				for( var c = 0; c < actualK; c++ ){
					var d = colorDistanceSq(sr, sg, sb, centroids[c].r, centroids[c].g, centroids[c].b);
					if( d < bestDist ){
						bestDist = d;
						bestC = c;
					}
				}
				clusterSumR[bestC] += sr;
				clusterSumG[bestC] += sg;
				clusterSumB[bestC] += sb;
				clusterCount[bestC]++;
			}

			var maxShift = 0;
			for( var c = 0; c < actualK; c++ ){
				if( clusterCount[c] > 0 ){
					var newR = Math.round(clusterSumR[c] / clusterCount[c]);
					var newG = Math.round(clusterSumG[c] / clusterCount[c]);
					var newB = Math.round(clusterSumB[c] / clusterCount[c]);
					var shift = Math.abs(centroids[c].r - newR) + Math.abs(centroids[c].g - newG) + Math.abs(centroids[c].b - newB);
					if( shift > maxShift ) maxShift = shift;
					centroids[c].r = newR;
					centroids[c].g = newG;
					centroids[c].b = newB;
				} else {
					var randIdx = Math.floor(Math.random() * numSamples);
					centroids[c].r = sampleR[randIdx];
					centroids[c].g = sampleG[randIdx];
					centroids[c].b = sampleB[randIdx];
					maxShift = 255;
				}
			}

			if( maxShift <= 1 ){
				break;
			}
		}

		while( centroids.length < k ){
			centroids.push({ r: 255, g: 255, b: 255, a: 255 });
		}

		// 4. Sort palette by luminance for consistent UI ordering
		centroids.sort(function(c1, c2){
			var lum1 = 0.2126 * c1.r + 0.7152 * c1.g + 0.0722 * c1.b;
			var lum2 = 0.2126 * c2.r + 0.7152 * c2.g + 0.0722 * c2.b;
			return lum1 - lum2;
		});

		return { palette: centroids };
	},// End of kMeansColorQuantization()
	
	// Sampling a palette from imagedata
	this.samplepalette = function( numberofcolors, imgd ){
		var idx, palette=[];
		for(var i=0; i<numberofcolors; i++){
			idx = Math.floor( Math.random() * imgd.data.length / 4 ) * 4;
			palette.push({ r:imgd.data[idx  ], g:imgd.data[idx+1], b:imgd.data[idx+2], a:imgd.data[idx+3] });
		}
		return palette;
	},// End of samplepalette()
	
	// Deterministic sampling a palette from imagedata: rectangular grid
	this.samplepalette2 = function( numberofcolors, imgd ){
		var idx, palette=[], ni = Math.ceil(Math.sqrt(numberofcolors)), nj = Math.ceil(numberofcolors/ni),
			vx = imgd.width / (ni+1), vy = imgd.height / (nj+1);
		for(var j=0; j<nj; j++){
			for(var i=0; i<ni; i++){
				if(palette.length === numberofcolors){
					break;
				}else{
					idx = Math.floor( ((j+1)*vy) * imgd.width + ((i+1)*vx) ) * 4;
					palette.push( { r:imgd.data[idx], g:imgd.data[idx+1], b:imgd.data[idx+2], a:imgd.data[idx+3] } );
				}
			}
		}
		return palette;
	},// End of samplepalette2()
	
	// Generating a palette with numberofcolors
	this.generatepalette = function(numberofcolors){
		var palette = [], rcnt, gcnt, bcnt;
		if(numberofcolors<8){
			
			// Grayscale
			var graystep = Math.floor(255/(numberofcolors-1));
			for(var i=0; i<numberofcolors; i++){ palette.push({ r:i*graystep, g:i*graystep, b:i*graystep, a:255 }); }
			
		}else{
			
			// RGB color cube
			var colorqnum = Math.floor(Math.pow(numberofcolors, 1/3)), // Number of points on each edge on the RGB color cube
				colorstep = Math.floor(255/(colorqnum-1)), // distance between points
				rndnum = numberofcolors - colorqnum*colorqnum*colorqnum; // number of random colors
			
			for(rcnt=0; rcnt<colorqnum; rcnt++){
				for(gcnt=0; gcnt<colorqnum; gcnt++){
					for(bcnt=0; bcnt<colorqnum; bcnt++){
						palette.push( { r:rcnt*colorstep, g:gcnt*colorstep, b:bcnt*colorstep, a:255 } );
					}// End of blue loop
				}// End of green loop
			}// End of red loop
			
			// Rest is random
			for(rcnt=0; rcnt<rndnum; rcnt++){ palette.push({ r:Math.floor(Math.random()*255), g:Math.floor(Math.random()*255), b:Math.floor(Math.random()*255), a:Math.floor(Math.random()*255) }); }

		}// End of numberofcolors check
		
		return palette;
	},// End of generatepalette()
		
	// 2. Layer separation and edge detection
	// Edge node types ( ▓: this layer or 1; ░: not this layer or 0 )
	// 12  ░░  ▓░  ░▓  ▓▓  ░░  ▓░  ░▓  ▓▓  ░░  ▓░  ░▓  ▓▓  ░░  ▓░  ░▓  ▓▓
	// 48  ░░  ░░  ░░  ░░  ░▓  ░▓  ░▓  ░▓  ▓░  ▓░  ▓░  ▓░  ▓▓  ▓▓  ▓▓  ▓▓
	//     0   1   2   3   4   5   6   7   8   9   10  11  12  13  14  15
	this.layering = function(ii){
		// Creating layers for each indexed color in arr
		var layers = [], val=0, ah = ii.array.length, aw = ii.array[0].length, n1,n2,n3,n4,n5,n6,n7,n8, i, j, k;
		
		// Create layers
		for(k=0; k<ii.palette.length; k++){
			layers[k] = [];
			for(j=0; j<ah; j++){
				layers[k][j] = [];
				for(i=0; i<aw; i++){
					layers[k][j][i]=0;
				}
			}
		}
		
		// Looping through all pixels and calculating edge node type
		for(j=1; j<ah-1; j++){
			for(i=1; i<aw-1; i++){
				
				// This pixel's indexed color
				val = ii.array[j][i];
				
				// Are neighbor pixel colors the same?
				n1 = ii.array[j-1][i-1]===val ? 1 : 0;
				n2 = ii.array[j-1][i  ]===val ? 1 : 0;
				n3 = ii.array[j-1][i+1]===val ? 1 : 0;
				n4 = ii.array[j  ][i-1]===val ? 1 : 0;
				n5 = ii.array[j  ][i+1]===val ? 1 : 0;
				n6 = ii.array[j+1][i-1]===val ? 1 : 0;
				n7 = ii.array[j+1][i  ]===val ? 1 : 0;
				n8 = ii.array[j+1][i+1]===val ? 1 : 0;
				
				// this pixel's type and looking back on previous pixels
				layers[val][j+1][i+1] = 1 + n5 * 2 + n8 * 4 + n7 * 8 ;
				if(!n4){ layers[val][j+1][i  ] = 0 + 2 + n7 * 4 + n6 * 8 ; }
				if(!n2){ layers[val][j  ][i+1] = 0 + n3*2 + n5 * 4 + 8 ; }
				if(!n1){ layers[val][j  ][i  ] = 0 + n2*2 + 4 + n4 * 8 ; }
				
			}// End of i loop
		}// End of j loop
		
		return layers;
	},// End of layering()
	
	// 2. Layer separation and edge detection
	// Edge node types ( ▓: this layer or 1; ░: not this layer or 0 )
	// 12  ░░  ▓░  ░▓  ▓▓  ░░  ▓░  ░▓  ▓▓  ░░  ▓░  ░▓  ▓▓  ░░  ▓░  ░▓  ▓▓
	// 48  ░░  ░░  ░░  ░░  ░▓  ░▓  ░▓  ░▓  ▓░  ▓░  ▓░  ▓░  ▓▓  ▓▓  ▓▓  ▓▓
	//     0   1   2   3   4   5   6   7   8   9   10  11  12  13  14  15
	this.layeringstep = function(ii,cnum){
		// Creating layers for each indexed color in arr
		var layer = [], val=0, ah = ii.array.length, aw = ii.array[0].length, n1,n2,n3,n4,n5,n6,n7,n8, i, j, k;
		
		// Create layer
		for(j=0; j<ah; j++){
			layer[j] = [];
			for(i=0; i<aw; i++){
				layer[j][i]=0;
			}
		}
		
		// Looping through all pixels and calculating edge node type
		for(j=1; j<ah; j++){
			for(i=1; i<aw; i++){
				layer[j][i] =
					( ii.array[j-1][i-1]===cnum ? 1 : 0 ) +
					( ii.array[j-1][i]===cnum ? 2 : 0 ) +
					( ii.array[j][i-1]===cnum ? 8 : 0 ) +
					( ii.array[j][i]===cnum ? 4 : 0 )
				;
			}// End of i loop
		}// End of j loop
			
		return layer;
	},// End of layeringstep()
	
	// Point in polygon test
	this.pointinpoly = function( p, pa ){
		var isin=false;

		for(var i=0,j=pa.length-1; i<pa.length; j=i++){
			isin =
				( ((pa[i].y > p.y) !== (pa[j].y > p.y)) && (p.x < (pa[j].x - pa[i].x) * (p.y - pa[i].y) / (pa[j].y - pa[i].y) + pa[i].x) )
				? !isin : isin;
		}

		return isin;
	},

	// Polylabel Maximum Inscribed Circle algorithm:
	// Tests whether a circle of radius minRadius can fit completely inside a closed polygon without crossing the outer boundary.
	this.pointToPolygonDist = function(p, points){
		var inside = false;
		var minDistSq = Infinity;
		var len = points.length;

		for(var i = 0, j = len - 1; i < len; j = i++){
			var a = points[i];
			var b = points[j];

			if(((a.y > p.y) !== (b.y > p.y)) &&
				(p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x)){
				inside = !inside;
			}

			var dSq = _this.potraceDistToSegSq(p, a, b);
			if(dSq < minDistSq){
				minDistSq = dSq;
			}
		}

		return (inside ? 1 : -1) * Math.sqrt(minDistSq);
	},

	this.canContainCircle = function(points, bbox, minRadius, precision){
		if(!points || points.length < 3){ return false; }
		if(!minRadius || minRadius <= 0){ return true; }
		precision = precision || 0.5;

		var minX = bbox[0], minY = bbox[1], maxX = bbox[2], maxY = bbox[3];
		var width = maxX - minX;
		var height = maxY - minY;

		// 1. Instant Bounding Box check:
		// If bounding box width or height is smaller than the circle diameter, it cannot fit
		if(width < minRadius * 2 || height < minRadius * 2){
			return false;
		}

		// 2. Fast check at bounding box center
		var cx = (minX + maxX) * 0.5;
		var cy = (minY + maxY) * 0.5;
		var centerDist = _this.pointToPolygonDist({ x: cx, y: cy }, points);
		if(centerDist >= minRadius){
			return true;
		}

		// 3. Grid setup for Polylabel
		var cellSize = Math.min(width, height);
		var h = cellSize * 0.5;
		if(cellSize <= 0){ return false; }

		var queue = [];
		function pushCell(cell){
			queue.push(cell);
			var idx = queue.length - 1;
			while(idx > 0){
				var p = (idx - 1) >> 1;
				if(queue[idx].max <= queue[p].max){ break; }
				var tmp = queue[idx]; queue[idx] = queue[p]; queue[p] = tmp;
				idx = p;
			}
		}
		function popCell(){
			var top = queue[0];
			var bot = queue.pop();
			if(queue.length > 0){
				queue[0] = bot;
				var idx = 0, len = queue.length;
				while((idx << 1) + 1 < len){
					var left = (idx << 1) + 1, right = left + 1, best = idx;
					if(queue[left].max > queue[best].max){ best = left; }
					if(right < len && queue[right].max > queue[best].max){ best = right; }
					if(best === idx){ break; }
					var t = queue[idx]; queue[idx] = queue[best]; queue[best] = t;
					idx = best;
				}
			}
			return top;
		}

		var bestDist = centerDist;
		for(var x = minX; x < maxX; x += cellSize){
			for(var y = minY; y < maxY; y += cellSize){
				var cd = _this.pointToPolygonDist({ x: x + h, y: y + h }, points);
				var cm = cd + h * Math.SQRT2;
				if(cd > bestDist){ bestDist = cd; }
				if(bestDist >= minRadius){ return true; }
				if(cm >= minRadius){
					pushCell({ x: x + h, y: y + h, h: h, d: cd, max: cm });
				}
			}
		}

		// 4. Polylabel branch & bound loop
		var maxIterations = 64;
		var iters = 0;
		while(queue.length > 0 && iters < maxIterations){
			iters++;
			var cell = popCell();

			if(cell.d > bestDist){
				bestDist = cell.d;
				if(bestDist >= minRadius){
					return true;
				}
			}

			if(cell.max < minRadius || cell.max - bestDist <= precision){
				if(cell.max < minRadius && queue.length === 0){
					break;
				}
				continue;
			}

			var subH = cell.h * 0.5;
			var offsets = [
				[-subH, -subH], [subH, -subH],
				[-subH, subH],  [subH, subH]
			];
			for(var k = 0; k < 4; k++){
				var nx = cell.x + offsets[k][0], ny = cell.y + offsets[k][1];
				var nd = _this.pointToPolygonDist({ x: nx, y: ny }, points);
				var nm = nd + subH * Math.SQRT2;
				if(nd > bestDist){
					bestDist = nd;
					if(bestDist >= minRadius){ return true; }
				}
				if(nm >= minRadius){
					pushCell({ x: nx, y: ny, h: subH, d: nd, max: nm });
				}
			}
		}

		return bestDist >= minRadius;
	},
	
	// Lookup tables for pathscan
	// pathscan_combined_lookup[ arr[py][px] ][ dir ] = [nextarrpypx, nextdir, deltapx, deltapy];
	this.pathscan_combined_lookup = [
		[[-1,-1,-1,-1], [-1,-1,-1,-1], [-1,-1,-1,-1], [-1,-1,-1,-1]],// arr[py][px]===0 is invalid
		[[ 0, 1, 0,-1], [-1,-1,-1,-1], [-1,-1,-1,-1], [ 0, 2,-1, 0]],
		[[-1,-1,-1,-1], [-1,-1,-1,-1], [ 0, 1, 0,-1], [ 0, 0, 1, 0]],
		[[ 0, 0, 1, 0], [-1,-1,-1,-1], [ 0, 2,-1, 0], [-1,-1,-1,-1]],
		
		[[-1,-1,-1,-1], [ 0, 0, 1, 0], [ 0, 3, 0, 1], [-1,-1,-1,-1]],
		[[13, 3, 0, 1], [13, 2,-1, 0], [ 7, 1, 0,-1], [ 7, 0, 1, 0]],
		[[-1,-1,-1,-1], [ 0, 1, 0,-1], [-1,-1,-1,-1], [ 0, 3, 0, 1]],
		[[ 0, 3, 0, 1], [ 0, 2,-1, 0], [-1,-1,-1,-1], [-1,-1,-1,-1]],
		
		[[ 0, 3, 0, 1], [ 0, 2,-1, 0], [-1,-1,-1,-1], [-1,-1,-1,-1]],
		[[-1,-1,-1,-1], [ 0, 1, 0,-1], [-1,-1,-1,-1], [ 0, 3, 0, 1]],
		[[11, 1, 0,-1], [14, 0, 1, 0], [14, 3, 0, 1], [11, 2,-1, 0]],
		[[-1,-1,-1,-1], [ 0, 0, 1, 0], [ 0, 3, 0, 1], [-1,-1,-1,-1]],
		
		[[ 0, 0, 1, 0], [-1,-1,-1,-1], [ 0, 2,-1, 0], [-1,-1,-1,-1]],
		[[-1,-1,-1,-1], [-1,-1,-1,-1], [ 0, 1, 0,-1], [ 0, 0, 1, 0]],
		[[ 0, 1, 0,-1], [-1,-1,-1,-1], [-1,-1,-1,-1], [ 0, 2,-1, 0]],
		[[-1,-1,-1,-1], [-1,-1,-1,-1], [-1,-1,-1,-1], [-1,-1,-1,-1]]// arr[py][px]===15 is invalid
	],

	// 3. Walking through an edge node array, discarding edge node types 0 and 15 and creating paths from the rest.
	// Walk directions (dir): 0 > ; 1 ^ ; 2 < ; 3 v 
	this.pathscan = function( arr, pathomit, options ){
		var paths=[], pacnt=0, pcnt=0, px=0, py=0, w = arr[0].length, h = arr.length,
			dir=0, pathfinished=true, holepath=false, lookuprow;
		
		for(var j=0; j<h; j++){
			for(var i=0; i<w; i++){
				if( (arr[j][i] == 4) || ( arr[j][i] == 11) ){ // Other values are not valid
					
					// Init
					px = i; py = j;
					paths[pacnt] = {};
					paths[pacnt].points = [];
					paths[pacnt].boundingbox = [px,py,px,py];
					paths[pacnt].holechildren = [];
					pathfinished = false;
					pcnt=0;
					holepath = (arr[j][i]==11);
					dir = 1;

					// Path points loop
					while(!pathfinished){
						
						// New path point
						paths[pacnt].points[pcnt] = {};
						paths[pacnt].points[pcnt].x = px-1;
						paths[pacnt].points[pcnt].y = py-1;
						paths[pacnt].points[pcnt].t = arr[py][px];
						
						// Bounding box
						if( (px-1) < paths[pacnt].boundingbox[0] ){ paths[pacnt].boundingbox[0] = px-1; }
						if( (px-1) > paths[pacnt].boundingbox[2] ){ paths[pacnt].boundingbox[2] = px-1; }
						if( (py-1) < paths[pacnt].boundingbox[1] ){ paths[pacnt].boundingbox[1] = py-1; }
						if( (py-1) > paths[pacnt].boundingbox[3] ){ paths[pacnt].boundingbox[3] = py-1; }
						
						// Next: look up the replacement, direction and coordinate changes = clear this cell, turn if required, walk forward
						lookuprow = _this.pathscan_combined_lookup[ arr[py][px] ][ dir ];
						arr[py][px] = lookuprow[0]; dir = lookuprow[1]; px += lookuprow[2]; py += lookuprow[3];

						// Close path
						if( (px-1 === paths[pacnt].points[0].x ) && ( py-1 === paths[pacnt].points[0].y ) ){
							pathfinished = true;
							
							// Discarding speckles using Polylabel circular containment test
							var speckleRadius = options ? (options.speckleRadius !== undefined ? options.speckleRadius : options.speckleradius) : undefined;
							var hasSpeckleRadius = (speckleRadius !== undefined && speckleRadius !== null);
							var sRadius = hasSpeckleRadius ? Number(speckleRadius) : 0;

							var shouldOmit = false;
							if(paths[pacnt].points.length < 3){
								shouldOmit = true;
							}else if(hasSpeckleRadius && sRadius > 0){
								// Polylabel: Test if a circle of radius sRadius can fit inside without spilling outside
								shouldOmit = !_this.canContainCircle( paths[pacnt].points, paths[pacnt].boundingbox, sRadius );
							}else if(pathomit > 0 && paths[pacnt].points.length < pathomit){
								shouldOmit = true;
							}

							if(shouldOmit){
								paths.pop();
							}else{
							
								paths[pacnt].isholepath = holepath ? true : false;
								
								// Finding the parent shape for this hole
								if(holepath){
									
									var parentidx = 0, parentbbox = [-1,-1,w+1,h+1];
									for(var parentcnt=0; parentcnt < pacnt; parentcnt++){
										if( (!paths[parentcnt].isholepath) &&
											_this.boundingboxincludes( paths[parentcnt].boundingbox , paths[pacnt].boundingbox ) &&
											_this.boundingboxincludes( parentbbox , paths[parentcnt].boundingbox ) &&
											_this.pointinpoly( paths[pacnt].points[0], paths[parentcnt].points )
										){
											parentidx = parentcnt;
											parentbbox = paths[parentcnt].boundingbox;
										}
									}
									
									paths[parentidx].holechildren.push( pacnt );
									
								}// End of holepath parent finding
								
								pacnt++;
							
							}
							
						}// End of Close path
						
						pcnt++;
						
					}// End of Path points loop
					
				}// End of Follow path
				
			}// End of i loop
		}// End of j loop
		
		return paths;
	},// End of pathscan()
	
	this.boundingboxincludes = function( parentbbox, childbbox ){
		return ( ( parentbbox[0] < childbbox[0] ) && ( parentbbox[1] < childbbox[1] ) && ( parentbbox[2] > childbbox[2] ) && ( parentbbox[3] > childbbox[3] ) );
	},// End of boundingboxincludes()
	
	// 3. Batch pathscan
	this.batchpathscan = function( layers, pathomit, options ){
		var bpaths = [];
		for(var k in layers){
			if(!layers.hasOwnProperty(k)){ continue; }
			bpaths[k] = _this.pathscan( layers[k], pathomit, options );
		}
		return bpaths;
	},
	
	// 4. interpollating between path points for nodes with 8 directions ( East, SouthEast, S, SW, W, NW, N, NE )
	this.internodes = function( paths, options ){
		var ins = [], palen=0, nextidx=0, nextidx2=0, previdx=0, previdx2=0, pacnt, pcnt;
		
		// paths loop
		for(pacnt=0; pacnt<paths.length; pacnt++){
			
			ins[pacnt] = {};
			ins[pacnt].points = [];
			ins[pacnt].boundingbox = paths[pacnt].boundingbox;
			ins[pacnt].holechildren = paths[pacnt].holechildren;
			ins[pacnt].isholepath = paths[pacnt].isholepath;
			palen = paths[pacnt].points.length;
			
			// pathpoints loop
			for(pcnt=0; pcnt<palen; pcnt++){
			
				// next and previous point indexes
				nextidx = (pcnt+1)%palen; nextidx2 = (pcnt+2)%palen; previdx = (pcnt-1+palen)%palen; previdx2 = (pcnt-2+palen)%palen;
				
				// right angle enhance
				if( options.rightangleenhance && _this.testrightangle( paths[pacnt], previdx2, previdx, pcnt, nextidx, nextidx2 ) ){
					
					// Fix previous direction
					if(ins[pacnt].points.length > 0){
						ins[pacnt].points[ ins[pacnt].points.length-1 ].linesegment = _this.getdirection(
								ins[pacnt].points[ ins[pacnt].points.length-1 ].x,
								ins[pacnt].points[ ins[pacnt].points.length-1 ].y,
								paths[pacnt].points[pcnt].x,
								paths[pacnt].points[pcnt].y
							);
					}
					
					// This corner point
					ins[pacnt].points.push({
						x : paths[pacnt].points[pcnt].x,
						y : paths[pacnt].points[pcnt].y,
						linesegment : _this.getdirection(
								paths[pacnt].points[pcnt].x,
								paths[pacnt].points[pcnt].y,
								(( paths[pacnt].points[pcnt].x + paths[pacnt].points[nextidx].x ) /2),
								(( paths[pacnt].points[pcnt].y + paths[pacnt].points[nextidx].y ) /2)
							)
					});
					
				}// End of right angle enhance
				
				// interpolate between two path points
				ins[pacnt].points.push({
					x : (( paths[pacnt].points[pcnt].x + paths[pacnt].points[nextidx].x ) /2),
					y : (( paths[pacnt].points[pcnt].y + paths[pacnt].points[nextidx].y ) /2),
					linesegment : _this.getdirection(
							(( paths[pacnt].points[pcnt].x + paths[pacnt].points[nextidx].x ) /2),
							(( paths[pacnt].points[pcnt].y + paths[pacnt].points[nextidx].y ) /2),
							(( paths[pacnt].points[nextidx].x + paths[pacnt].points[nextidx2].x ) /2),
							(( paths[pacnt].points[nextidx].y + paths[pacnt].points[nextidx2].y ) /2)
						)
				});
				
			}// End of pathpoints loop
						
		}// End of paths loop
		
		return ins;
	},// End of internodes()
	
	this.testrightangle = function( path, idx1, idx2, idx3, idx4, idx5 ){
		return ( (( path.points[idx3].x === path.points[idx1].x) &&
				  ( path.points[idx3].x === path.points[idx2].x) &&
				  ( path.points[idx3].y === path.points[idx4].y) &&
				  ( path.points[idx3].y === path.points[idx5].y)
				 ) ||
				 (( path.points[idx3].y === path.points[idx1].y) &&
				  ( path.points[idx3].y === path.points[idx2].y) &&
				  ( path.points[idx3].x === path.points[idx4].x) &&
				  ( path.points[idx3].x === path.points[idx5].x)
				 )
		);
	},// End of testrightangle()
	
	this.getdirection = function( x1, y1, x2, y2 ){
		var val = 8;
		if(x1 < x2){
			if     (y1 < y2){ val = 1; }// SouthEast
			else if(y1 > y2){ val = 7; }// NE
			else            { val = 0; }// E
		}else if(x1 > x2){
			if     (y1 < y2){ val = 3; }// SW
			else if(y1 > y2){ val = 5; }// NW
			else            { val = 4; }// W
		}else{
			if     (y1 < y2){ val = 2; }// S
			else if(y1 > y2){ val = 6; }// N
			else            { val = 8; }// center, this should not happen
		}
		return val;
	},// End of getdirection()
	
	// 4. Batch interpollation
	this.batchinternodes = function( bpaths, options ){
		var binternodes = [];
		for (var k in bpaths) {
			if(!bpaths.hasOwnProperty(k)){ continue; }
			binternodes[k] = _this.internodes(bpaths[k], options);
		}
		return binternodes;
	},
	
	// 5. tracepath() : recursively trying to fit straight and quadratic spline segments on the 8 direction internode path
	
	// 5.1. Find sequences of points with only 2 segment types
	// 5.2. Fit a straight line on the sequence
	// 5.3. If the straight line fails (distance error > ltres), find the point with the biggest error
	// 5.4. Fit a quadratic spline through errorpoint (project this to get controlpoint), then measure errors on every point in the sequence
	// 5.5. If the spline fails (distance error > qtres), find the point with the biggest error, set splitpoint = fitting point
	// 5.6. Split sequence and recursively apply 5.2. - 5.6. to startpoint-splitpoint and splitpoint-endpoint sequences
	
	// 5. Potrace curve smoothing helpers and pipeline
	this.potraceDistToSegSq = function(p, a, b){
		var dx = b.x - a.x, dy = b.y - a.y;
		var l2 = dx*dx + dy*dy;
		if(l2 === 0){
			var ex = p.x - a.x, ey = p.y - a.y;
			return ex*ex + ey*ey;
		}
		var t = ((p.x - a.x)*dx + (p.y - a.y)*dy) / l2;
		if(t < 0){ t = 0; } else if(t > 1){ t = 1; }
		var px = a.x + t*dx, py = a.y + t*dy;
		var rx = p.x - px, ry = p.y - py;
		return rx*rx + ry*ry;
	};

	this.potraceRelaxPolygon = function(points, steps, lambda){
		if(steps <= 0){ return points; }
		lambda = (lambda !== undefined && lambda !== null) ? lambda : 0.4;
		var pts = points;
		for(var s = 0; s < steps; s++){
			var len = pts.length;
			var next = new Array(len);
			for(var i = 0; i < len; i++){
				var prev = pts[(i - 1 + len) % len];
				var curr = pts[i];
				var nxt = pts[(i + 1) % len];
				next[i] = {
					x: curr.x + lambda * (0.5 * (prev.x + nxt.x) - curr.x),
					y: curr.y + lambda * (0.5 * (prev.y + nxt.y) - curr.y)
				};
			}
			pts = next;
		}
		return pts;
	};

	this.potraceRDP = function(points, startIdx, endIdx, epsilonSq, outIndices){
		var maxDistSq = 0, index = -1;
		var a = points[startIdx], b = points[endIdx];
		for(var i = startIdx + 1; i < endIdx; i++){
			var dSq = _this.potraceDistToSegSq(points[i], a, b);
			if(dSq > maxDistSq){
				maxDistSq = dSq;
				index = i;
			}
		}
		if(maxDistSq > epsilonSq && index !== -1){
			_this.potraceRDP(points, startIdx, index, epsilonSq, outIndices);
			outIndices.push(index);
			_this.potraceRDP(points, index, endIdx, epsilonSq, outIndices);
		}
	};

	this.potraceSimplifyClosed = function(points, epsilon){
		var n = points.length;
		if(n <= 3){ return points.slice(); }
		var epsilonSq = epsilon * epsilon;

		// Find point furthest from point 0 to split closed cycle into 2 arcs
		var maxD = -1, splitIdx = Math.floor(n / 2), p0 = points[0];
		for(var i = 1; i < n; i++){
			var dx = points[i].x - p0.x, dy = points[i].y - p0.y;
			var d = dx*dx + dy*dy;
			if(d > maxD){
				maxD = d;
				splitIdx = i;
			}
		}

		var indices = [0];
		_this.potraceRDP(points, 0, splitIdx, epsilonSq, indices);
		indices.push(splitIdx);
		_this.potraceRDP(points, splitIdx, n - 1, epsilonSq, indices);
		if(indices[indices.length - 1] !== n - 1){
			indices.push(n - 1);
		}

		var simplified = [];
		for(var k = 0; k < indices.length; k++){
			simplified.push(points[indices[k]]);
		}
		return simplified;
	};

	this.potraceOptimizeSegments = function(segments){
		if(!segments || segments.length < 3){ return segments || []; }

		// Simplify flat curves into straight lines
		var optSegs = [];
		for(var i = 0; i < segments.length; i++){
			var s = segments[i];
			if(s.type === 'Q'){
				var dSq = _this.potraceDistToSegSq({ x: s.x2, y: s.y2 }, { x: s.x1, y: s.y1 }, { x: s.x3, y: s.y3 });
				if(dSq < 0.05 * 0.05){
					optSegs.push({ type: 'L', x1: s.x1, y1: s.y1, x2: s.x3, y2: s.y3 });
					continue;
				}
			}
			optSegs.push(s);
		}

		// Merge consecutive collinear line segments
		var merged = [];
		for(var j = 0; j < optSegs.length; j++){
			var seg = optSegs[j];
			if(merged.length > 0 && merged[merged.length - 1].type === 'L' && seg.type === 'L'){
				var prev = merged[merged.length - 1];
				var lineDSq = _this.potraceDistToSegSq({ x: prev.x2, y: prev.y2 }, { x: prev.x1, y: prev.y1 }, { x: seg.x2, y: seg.y2 });
				if(lineDSq < 0.05 * 0.05){
					prev.x2 = seg.x2;
					prev.y2 = seg.y2;
					continue;
				}
			}
			merged.push({
				type: seg.type,
				x1: seg.x1,
				y1: seg.y1,
				x2: seg.x2,
				y2: seg.y2,
				...(seg.type === 'Q' ? { x3: seg.x3, y3: seg.y3 } : {})
			});
		}

		// Collinear wrap-around check between last and first segment
		if(merged.length > 3 && merged[0].type === 'L' && merged[merged.length - 1].type === 'L'){
			var first = merged[0], last = merged[merged.length - 1];
			var wrapDSq = _this.potraceDistToSegSq({ x: last.x2, y: last.y2 }, { x: last.x1, y: last.y1 }, { x: first.x2, y: first.y2 });
			if(wrapDSq < 0.05 * 0.05){
				last.x2 = first.x2;
				last.y2 = first.y2;
				merged.shift();
			}
		}

		// Preserve valid loop with at least 3 segments
		if(merged.length < 3){
			return segments;
		}

		return merged;
	};

	this.potraceTracePath = function( path, ltres, qtres, options ){
		options = options || {};
		var smp = {
			segments: [],
			boundingbox: path.boundingbox,
			holechildren: path.holechildren,
			isholepath: path.isholepath
		};

		if(!path || !path.points || path.points.length < 3){
			return smp;
		}

		var smoothSteps = (options.smoothSteps !== undefined && options.smoothSteps !== null)
			? Math.max(0, Math.round(Number(options.smoothSteps)))
			: ((options.smoothsteps !== undefined && options.smoothsteps !== null) ? Math.max(0, Math.round(Number(options.smoothsteps))) : 2);

		var alphaMax = (options.alphaMax !== undefined && options.alphaMax !== null)
			? Math.max(0, Number(options.alphaMax))
			: ((options.alphamax !== undefined && options.alphamax !== null) ? Math.max(0, Number(options.alphamax)) : 1.0);

		var optTolerance = (options.optTolerance !== undefined && options.optTolerance !== null)
			? Math.max(0.001, Number(options.optTolerance))
			: ((options.opttolerance !== undefined && options.opttolerance !== null)
				? Math.max(0.001, Number(options.opttolerance))
				: (ltres !== undefined ? Math.max(0.001, Number(ltres)) : 1.0));

		// 1. Deduplicate consecutive identical points
		var rawPoints = path.points;
		var points = [];
		for(var i = 0; i < rawPoints.length; i++){
			var p = rawPoints[i];
			if(points.length === 0 || Math.hypot(p.x - points[points.length - 1].x, p.y - points[points.length - 1].y) > 1e-4){
				points.push({ x: p.x, y: p.y });
			}
		}
		if(points.length > 2 && Math.hypot(points[0].x - points[points.length - 1].x, points[0].y - points[points.length - 1].y) < 1e-4){
			points.pop();
		}
		if(points.length < 3){
			return smp;
		}

		// 2. Relaxation / smoothing passes
		if(smoothSteps > 0){
			points = _this.potraceRelaxPolygon(points, smoothSteps);
		}

		// 3. Optimal polygon approximation
		var poly = _this.potraceSimplifyClosed(points, optTolerance);
		var m = poly.length;
		if(m < 3){
			return smp;
		}

		// 4. Corner detection
		var isCorner = new Array(m);
		for(var ci = 0; ci < m; ci++){
			var prevV = poly[(ci - 1 + m) % m];
			var currV = poly[ci];
			var nextV = poly[(ci + 1) % m];

			var dx1 = currV.x - prevV.x;
			var dy1 = currV.y - prevV.y;
			var dx2 = nextV.x - currV.x;
			var dy2 = nextV.y - currV.y;

			var l1 = Math.hypot(dx1, dy1);
			var l2 = Math.hypot(dx2, dy2);

			if(l1 < 1e-5 || l2 < 1e-5){
				isCorner[ci] = false;
				continue;
			}

			var cosTheta = Math.max(-1, Math.min(1, (dx1*dx2 + dy1*dy2) / (l1 * l2)));
			var alpha = 1 - cosTheta;
			isCorner[ci] = alpha >= alphaMax;
		}

		// 5. Generate smooth Bézier curves and lines
		var segments = [];
		var midpoints = new Array(m);
		for(var mi = 0; mi < m; mi++){
			var cv = poly[mi];
			var nv = poly[(mi + 1) % m];
			midpoints[mi] = {
				x: (cv.x + nv.x) * 0.5,
				y: (cv.y + nv.y) * 0.5
			};
		}

		for(var vi = 0; vi < m; vi++){
			var pIdx = (vi - 1 + m) % m;
			var cIdx = vi;
			var nIdx = (vi + 1) % m;

			var pMid = midpoints[pIdx];
			var cMid = midpoints[cIdx];
			var cVert = poly[cIdx];

			if(!isCorner[cIdx]){
				segments.push({
					type: 'Q',
					x1: pMid.x,
					y1: pMid.y,
					x2: cVert.x,
					y2: cVert.y,
					x3: cMid.x,
					y3: cMid.y
				});
			}else{
				if(!isCorner[pIdx]){
					segments.push({
						type: 'L',
						x1: pMid.x,
						y1: pMid.y,
						x2: cVert.x,
						y2: cVert.y
					});
				}else{
					segments.push({
						type: 'L',
						x1: poly[pIdx].x,
						y1: poly[pIdx].y,
						x2: cVert.x,
						y2: cVert.y
					});
				}

				if(!isCorner[nIdx]){
					segments.push({
						type: 'L',
						x1: cVert.x,
						y1: cVert.y,
						x2: cMid.x,
						y2: cMid.y
					});
				}
			}
		}

		// 6. Curve optimization
		smp.segments = _this.potraceOptimizeSegments(segments);
		return smp;
	};

	// Original standard path tracing (kept for optional comparison)
	this.standardTracePath = function( path, ltres, qtres ){
		var pcnt=0, segtype1, segtype2, seqend, smp = {};
		smp.segments = [];
		smp.boundingbox = path.boundingbox;
		smp.holechildren = path.holechildren;
		smp.isholepath = path.isholepath;
		
		while(pcnt < path.points.length){
			segtype1 = path.points[pcnt].linesegment; segtype2 = -1; seqend=pcnt+1;
			while(
				((path.points[seqend].linesegment === segtype1) || (path.points[seqend].linesegment === segtype2) || (segtype2 === -1))
				&& (seqend < path.points.length-1) ){
				
				if((path.points[seqend].linesegment!==segtype1) && (segtype2===-1)){ segtype2 = path.points[seqend].linesegment; }
				seqend++;
			}
			if(seqend === path.points.length-1){ seqend = 0; }

			smp.segments = smp.segments.concat( _this.fitseq(path, ltres, qtres, pcnt, seqend) );
			
			if(seqend>0){ pcnt = seqend; }else{ pcnt = path.points.length; }
		}
		
		return smp;
	};

	this.tracepath = function( path, ltres, qtres, options ){
		options = options || {};
		var curveAlg = (options.curveAlgorithm || options.curvealgorithm || '').toLowerCase();
		var edgeStyle = (options.edgeStyle || options.edgestyle || '').toLowerCase();
		if(edgeStyle === 'geometric' || curveAlg === 'geometric'){
			return _this.geometricTracePath( path, ltres, options );
		}
		if(curveAlg === 'standard'){
			return _this.standardTracePath( path, ltres, qtres );
		}
		return _this.potraceTracePath( path, ltres, qtres, options );
	},// End of tracepath()
		
	// 5.2. - 5.6. recursively fitting a straight or quadratic line segment on this sequence of path nodes,
	// called from tracepath()
	this.fitseq = function( path, ltres, qtres, seqstart, seqend ){
		// return if invalid seqend
		if( (seqend>path.points.length) || (seqend<0) ){ return []; }
		// variables
		var errorpoint=seqstart, errorval=0, curvepass=true, px, py, dist2;
		var tl = (seqend-seqstart); if(tl<0){ tl += path.points.length; }
		var vx = (path.points[seqend].x-path.points[seqstart].x) / tl,
			vy = (path.points[seqend].y-path.points[seqstart].y) / tl;
		
		// 5.2. Fit a straight line on the sequence
		var pcnt = (seqstart+1) % path.points.length, pl;
		while(pcnt != seqend){
			pl = pcnt-seqstart; if(pl<0){ pl += path.points.length; }
			px = path.points[seqstart].x + vx * pl; py = path.points[seqstart].y + vy * pl;
			dist2 = (path.points[pcnt].x-px)*(path.points[pcnt].x-px) + (path.points[pcnt].y-py)*(path.points[pcnt].y-py);
			if(dist2>ltres){curvepass=false;}
			if(dist2>errorval){ errorpoint=pcnt; errorval=dist2; }
			pcnt = (pcnt+1)%path.points.length;
		}
		// return straight line if fits
		if(curvepass){ return [{ type:'L', x1:path.points[seqstart].x, y1:path.points[seqstart].y, x2:path.points[seqend].x, y2:path.points[seqend].y }]; }
		
		// 5.3. If the straight line fails (distance error>ltres), find the point with the biggest error
		var fitpoint = errorpoint; curvepass = true; errorval = 0;
		
		// 5.4. Fit a quadratic spline through this point, measure errors on every point in the sequence
		// helpers and projecting to get control point
		var t=(fitpoint-seqstart)/tl, t1=(1-t)*(1-t), t2=2*(1-t)*t, t3=t*t;
		var cpx = (t1*path.points[seqstart].x + t3*path.points[seqend].x - path.points[fitpoint].x)/-t2 ,
			cpy = (t1*path.points[seqstart].y + t3*path.points[seqend].y - path.points[fitpoint].y)/-t2 ;
		
		// Check every point
		pcnt = seqstart+1;
		while(pcnt != seqend){
			t=(pcnt-seqstart)/tl; t1=(1-t)*(1-t); t2=2*(1-t)*t; t3=t*t;
			px = t1 * path.points[seqstart].x + t2 * cpx + t3 * path.points[seqend].x;
			py = t1 * path.points[seqstart].y + t2 * cpy + t3 * path.points[seqend].y;
			
			dist2 = (path.points[pcnt].x-px)*(path.points[pcnt].x-px) + (path.points[pcnt].y-py)*(path.points[pcnt].y-py);
			
			if(dist2>qtres){curvepass=false;}
			if(dist2>errorval){ errorpoint=pcnt; errorval=dist2; }
			pcnt = (pcnt+1)%path.points.length;
		}
		// return spline if fits
		if(curvepass){ return [{ type:'Q', x1:path.points[seqstart].x, y1:path.points[seqstart].y, x2:cpx, y2:cpy, x3:path.points[seqend].x, y3:path.points[seqend].y }]; }
		// 5.5. If the spline fails (distance error>qtres), find the point with the biggest error
		var splitpoint = fitpoint; // Earlier: Math.floor((fitpoint + errorpoint)/2);
		
		// 5.6. Split sequence and recursively apply 5.2. - 5.6. to startpoint-splitpoint and splitpoint-endpoint sequences
		return _this.fitseq( path, ltres, qtres, seqstart, splitpoint ).concat(
				_this.fitseq( path, ltres, qtres, splitpoint, seqend ) );
		
	},// End of fitseq()
	
	// 5. Batch tracing paths
	// 5. Batch tracing paths
	this.batchtracepaths = function(internodepaths, ltres, qtres, options){
		var btracedpaths = [];
		for(var k in internodepaths){
			if(!internodepaths.hasOwnProperty(k)){ continue; }
			btracedpaths.push( _this.tracepath(internodepaths[k], ltres, qtres, options) );
		}
		return btracedpaths;
	},
	
	// 5. Batch tracing layers
	this.batchtracelayers = function(binternodes, ltres, qtres, options){
		var btbis = [];
		for(var k in binternodes){
			if(!binternodes.hasOwnProperty(k)){ continue; }
			btbis[k] = _this.batchtracepaths(binternodes[k], ltres, qtres, options);
		}
		return btbis;
	},

	////////////////////////////////////////////////////////////
	//
	//  Hierarchical Region Decomposition & Area Stacking
	//
	////////////////////////////////////////////////////////////

	// Exact polygon area calculation using the Shoelace formula
	this.polygonArea = function(points){
		if(!points || points.length < 3) return 0;
		var area = 0;
		var n = points.length;
		for(var i=0; i<n; i++){
			var j = (i + 1) % n;
			area += points[i].x * points[j].y;
			area -= points[j].x * points[i].y;
		}
		return Math.abs(area) * 0.5;
	};

	// Scanline sampling inside polygon to identify dominant (mode) palette color
	this.getDominantPaletteColor = function(points, bbox, ii, palette){
		if(!palette || palette.length === 0){
			return { index: 0, color: { r:0, g:0, b:0, a:255 }, ratio: 1.0 };
		}
		var aw = ii.array[0].length - 2;
		var ah = ii.array.length - 2;
		var minX = Math.max(0, Math.floor(bbox[0]));
		var minY = Math.max(0, Math.floor(bbox[1]));
		var maxX = Math.min(aw - 1, Math.ceil(bbox[2]));
		var maxY = Math.min(ah - 1, Math.ceil(bbox[3]));

		var n = points.length;
		if(n < 3 || maxX < minX || maxY < minY){
			var cy = Math.max(0, Math.min(ah - 1, Math.round((minY + maxY) / 2)));
			var cx = Math.max(0, Math.min(aw - 1, Math.round((minX + maxX) / 2)));
			var defaultIdx = ii.array[cy + 1][cx + 1] % palette.length;
			return { index: defaultIdx, color: palette[defaultIdx], ratio: 1.0 };
		}

		var counts = new Int32Array(palette.length);
		var totalSampled = 0;

		var spanY = maxY - minY + 1;
		var spanX = maxX - minX + 1;
		var yStride = Math.max(1, Math.floor(spanY / 64));
		var xStride = Math.max(1, Math.floor(spanX / 64));

		for(var y = minY; y <= maxY; y += yStride){
			var py = y + 0.5;
			var nodeX = [];
			for(var i = 0; i < n; i++){
				var j = (i + 1) % n;
				var p1 = points[i];
				var p2 = points[j];
				if((p1.y < py && p2.y >= py) || (p2.y < py && p1.y >= py)){
					var x = p1.x + (py - p1.y) / (p2.y - p1.y) * (p2.x - p1.x);
					nodeX.push(x);
				}
			}
			if(nodeX.length < 2) continue;
			nodeX.sort(function(a, b){ return a - b; });

			for(var k = 0; k < nodeX.length; k += 2){
				if(k + 1 >= nodeX.length) break;
				var segStartX = Math.max(minX, Math.ceil(nodeX[k]));
				var segEndX = Math.min(maxX, Math.floor(nodeX[k + 1]));
				for(var x = segStartX; x <= segEndX; x += xStride){
					var c = ii.array[y + 1][x + 1];
					if(c >= 0 && c < palette.length){
						counts[c]++;
						totalSampled++;
					}
				}
			}
		}

		if(totalSampled === 0){
			var cy = Math.max(0, Math.min(ah - 1, Math.round((minY + maxY) / 2)));
			var cx = Math.max(0, Math.min(aw - 1, Math.round((minX + maxX) / 2)));
			var defaultIdx = ii.array[cy + 1][cx + 1] % palette.length;
			return { index: defaultIdx, color: palette[defaultIdx], ratio: 1.0 };
		}

		var bestCount = -1;
		var bestIdx = 0;
		for(var c = 0; c < palette.length; c++){
			if(counts[c] > bestCount){
				bestCount = counts[c];
				bestIdx = c;
			}
		}

		return {
			index: bestIdx,
			color: palette[bestIdx],
			ratio: bestCount / totalSampled
		};
	};

	// Geometric edge tracing: simplifies closed polygon with corner preservation, outputting crisp straight segments
	this.geometricTracePath = function(path, ltres, options){
		var smp = {};
		smp.segments = [];
		smp.boundingbox = path.boundingbox;
		smp.holechildren = [];
		smp.isholepath = false;

		var pts = path.points;
		if(!pts || pts.length < 3){
			return smp;
		}

		var tol = Number(ltres);
		if(!Number.isFinite(tol) || tol <= 0) tol = 1.0;
		var simplified = _this.potraceSimplifyClosed(pts, tol * 1.2);
		if(simplified.length < 3){
			simplified = pts;
		}

		var n = simplified.length;
		for(var i = 0; i < n; i++){
			var p1 = simplified[i];
			var p2 = simplified[(i + 1) % n];
			smp.segments.push({
				type: "L",
				x1: Math.round(p1.x * 100) / 100,
				y1: Math.round(p1.y * 100) / 100,
				x2: Math.round(p2.x * 100) / 100,
				y2: Math.round(p2.y * 100) / 100
			});
		}

		return smp;
	};

	// Fast separable box blur on 1D grayscale buffer (O(1) per pixel)
	this.boxBlurGrayscale = function(gray, w, h, radius){
		if(radius <= 0) return gray;
		var r = Math.min(10, Math.round(radius));
		var total = w * h;
		var tmp = new Uint8Array(total);
		var out = new Uint8Array(total);
		var div = 2 * r + 1;

		// Horizontal pass
		for(var y = 0; y < h; y++){
			var row = y * w;
			var acc = 0;
			for(var k = -r; k <= r; k++){
				acc += gray[row + Math.max(0, Math.min(w - 1, k))];
			}
			for(var x = 0; x < w; x++){
				tmp[row + x] = (acc / div) | 0;
				acc += gray[row + Math.min(w - 1, x + r + 1)] - gray[row + Math.max(0, x - r)];
			}
		}

		// Vertical pass
		for(var x = 0; x < w; x++){
			var acc = 0;
			for(var k = -r; k <= r; k++){
				acc += tmp[Math.max(0, Math.min(h - 1, k)) * w + x];
			}
			for(var y = 0; y < h; y++){
				out[y * w + x] = (acc / div) | 0;
				acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
			}
		}
		return out;
	};

	// Morphological closing: Dilation followed by Erosion to bridge line gaps of length <= 2*radius
	this.morphologicalClose = function(edges, w, h, radius){
		if(radius <= 0) return edges;
		var rad = Math.min(4, Math.round(radius));
		var total = w * h;

		// 1. Dilation
		var dil = new Uint8Array(total);
		for(var y = 0; y < h; y++){
			var row = y * w;
			for(var x = 0; x < w; x++){
				if(edges[row + x] === 1){
					for(var dy = -rad; dy <= rad; dy++){
						var ny = y + dy;
						if(ny < 0 || ny >= h) continue;
						var nrow = ny * w;
						for(var dx = -rad; dx <= rad; dx++){
							var nx = x + dx;
							if(nx < 0 || nx >= w) continue;
							dil[nrow + nx] = 1;
						}
					}
				}
			}
		}

		// 2. Erosion
		var ero = new Uint8Array(total);
		for(var y = 0; y < h; y++){
			var row = y * w;
			for(var x = 0; x < w; x++){
				if(dil[row + x] === 1){
					var allOne = true;
					for(var dy = -rad; dy <= rad; dy++){
						var ny = y + dy;
						if(ny < 0 || ny >= h) continue;
						var nrow = ny * w;
						for(var dx = -rad; dx <= rad; dx++){
							var nx = x + dx;
							if(nx < 0 || nx >= w) continue;
							if(dil[nrow + nx] === 0){ allOne = false; break; }
						}
						if(!allOne) break;
					}
					if(allOne) ero[row + x] = 1;
				}
			}
		}
		return ero;
	};

	// Edge network detector: captures line strokes, alpha contours, color boundaries, and contrast gradients
	this.detectEdgeMap = function(imgd, ii, options){
		options = options || {};
		var w = imgd.width, h = imgd.height, d = imgd.data;
		var total = w * h;
		var sensitivity = options.edgesensitivity !== undefined ? Number(options.edgesensitivity) : 35;
		var edgeBlur = options.edgeblur !== undefined ? Number(options.edgeblur) : 0;
		var gapClose = options.edgegapclose !== undefined ? Number(options.edgegapclose) : 1;
		var useThinning = options.edgethinning !== undefined ? Boolean(options.edgethinning) : true;
		var edges = null;

		// 0. Use precomputed AI neural edge map if provided (e.g. from TEED model)
		if(options.useedges === false){
			edges = new Uint8Array(total);
		}else if(options.aiedges && options.aiedges.length === total){
			edges = new Uint8Array(options.aiedges);
		}else{
			// 1. Convert to grayscale luminance
			var gray = new Uint8Array(total);
			for(var i = 0; i < total; i++){
				var idx = i * 4;
				gray[i] = (d[idx] * 0.299 + d[idx+1] * 0.587 + d[idx+2] * 0.114) | 0;
			}

			// 2. Pre-blur if specified
			if(edgeBlur > 0){
				gray = _this.boxBlurGrayscale(gray, w, h, edgeBlur);
			}

			// 3. Sobel gradient magnitude & angle
			var mag = new Float32Array(total);
			var dir = new Uint8Array(total);

			for(var y = 1; y < h - 1; y++){
				var rPrev = (y - 1) * w;
				var rCurr = y * w;
				var rNext = (y + 1) * w;
				for(var x = 1; x < w - 1; x++){
					var gx = (gray[rPrev + x + 1] + 2*gray[rCurr + x + 1] + gray[rNext + x + 1]) -
					         (gray[rPrev + x - 1] + 2*gray[rCurr + x - 1] + gray[rNext + x - 1]);
					var gy = (gray[rNext + x - 1] + 2*gray[rNext + x] + gray[rNext + x + 1]) -
					         (gray[rPrev + x - 1] + 2*gray[rPrev + x] + gray[rPrev + x + 1]);
					var p = rCurr + x;
					var m = Math.sqrt(gx * gx + gy * gy);
					mag[p] = m;

					if(useThinning){
						var angle = Math.atan2(gy, gx) * (180 / Math.PI);
						var a = angle < 0 ? angle + 180 : angle;
						if((a >= 0 && a < 22.5) || (a >= 157.5 && a <= 180)) dir[p] = 0;
						else if(a >= 22.5 && a < 67.5) dir[p] = 1;
						else if(a >= 67.5 && a < 112.5) dir[p] = 2;
						else dir[p] = 3;
					}
				}
			}

			// 4. Thresholding with optional Non-Maximum Suppression (1px Thinning)
			edges = new Uint8Array(total);

			for(var y = 1; y < h - 1; y++){
				var rCurr = y * w;
				for(var x = 1; x < w - 1; x++){
					var p = rCurr + x;
					var m = mag[p];
					if(m >= sensitivity){
						if(useThinning){
							var q = 0, r = 0;
							var dVal = dir[p];
							if(dVal === 0){ q = mag[p + 1]; r = mag[p - 1]; }
							else if(dVal === 1){ q = mag[p - w + 1]; r = mag[p + w - 1]; }
							else if(dVal === 2){ q = mag[p - w]; r = mag[p + w]; }
							else if(dVal === 3){ q = mag[p - w - 1]; r = mag[p + w + 1]; }

							if(m >= q && m >= r){
								edges[p] = 1;
							}
						}else{
							edges[p] = 1;
						}
					}
				}
			}

			// Dark line art stroke (e.g. wireframes like Frame 34)
			for(var y = 0; y < h; y++){
				var rCurr = y * w;
				for(var x = 0; x < w; x++){
					var p = rCurr + x;
					var idx = p * 4;
					if(d[idx+3] < 32) continue;
					if(d[idx] < 128 && d[idx+1] < 128 && d[idx+2] < 128){
						edges[p] = 1;
					}
				}
			}
		}

		// 5. Alpha boundaries & Color quantization boundaries
		for(var y = 0; y < h; y++){
			var rCurr = y * w;
			var rPrev = (y > 0 ? y - 1 : y) * w;
			var rNext = (y < h - 1 ? y + 1 : y) * w;
			for(var x = 0; x < w; x++){
				var p = rCurr + x;
				var idx = p * 4;
				var a = d[idx+3];

				if(a < 32) continue; // transparent pixel

				// Alpha boundary transition (transparent next to opaque)
				if(x > 0 && d[(rCurr + x - 1)*4 + 3] < 32){ edges[p] = 1; continue; }
				if(x < w - 1 && d[(rCurr + x + 1)*4 + 3] < 32){ edges[p] = 1; continue; }
				if(y > 0 && d[(rPrev + x)*4 + 3] < 32){ edges[p] = 1; continue; }
				if(y < h - 1 && d[(rNext + x)*4 + 3] < 32){ edges[p] = 1; continue; }

				// Color quantization boundary from ii (if available)
				if(ii && ii.array){
					var cCurr = ii.array[y + 1][x + 1];
					if(x < w - 1 && ii.array[y + 1][x + 2] !== cCurr){ edges[p] = 1; continue; }
					if(y < h - 1 && ii.array[y + 2][x + 1] !== cCurr){ edges[p] = 1; continue; }
				}
			}
		}

		// 6. Morphological Gap Closing (bridge broken line segments to prevent flood-fill leaks)
		if(gapClose > 0 && options.useedges !== false){
			edges = _this.morphologicalClose(edges, w, h, gapClose);
		}

		return edges;
	};

	// Hierarchical layer-decomposition: Outer Edge Peeling (Planar Graph Peel-and-Hull Decomposition)
	// Progressively decomposes image wireframe into nested solid hulls stacked Area Descending (Largest -> Smallest)
	this.hierarchicalTracedata = function( imgd, ii, options ){
		options = _this.checkoptions(options);
		var palette = ii.palette;
		var w = imgd.width, h = imgd.height, total = w * h;
		var edgeStyle = (options.edgestyle || options.edgeStyle || 'organic').toLowerCase();
		var speckleRadius = options.speckleRadius !== undefined ? Number(options.speckleRadius) : Number(options.speckleradius || 1.5);
		var minRegionArea = options.minregionarea !== undefined ? Number(options.minregionarea) : Math.max(4, Math.PI * speckleRadius * speckleRadius * 0.5);
		var pathomit = options.pathomit !== undefined ? Number(options.pathomit) : 8;

		// 1. Detect Edge Network
		var edges = _this.detectEdgeMap(imgd, ii, options);

		// 2. Connected Component Labeling on non-edge pixels
		var labels = new Int32Array(total);
		var queue = new Int32Array(total);
		var compCount = 0;
		var components = [];

		for(var y = 0; y < h; y++){
			for(var x = 0; x < w; x++){
				var p = y * w + x;
				if(edges[p] === 0 && labels[p] === 0){
					compCount++;
					var head = 0, tail = 0;
					queue[tail++] = p;
					labels[p] = compCount;
					var minPx = x, maxPx = x, minPy = y, maxPy = y;
					var touchesBorder = false;
					var count = 0;

					while(head < tail){
						var curr = queue[head++];
						count++;
						var cx = curr % w;
						var cy = (curr / w) | 0;
						if(cx < minPx) minPx = cx;
						if(cx > maxPx) maxPx = cx;
						if(cy < minPy) minPy = cy;
						if(cy > maxPy) maxPy = cy;
						if(cx === 0 || cx === w - 1 || cy === 0 || cy === h - 1) touchesBorder = true;

						if(cx > 0 && edges[curr - 1] === 0 && labels[curr - 1] === 0){ labels[curr - 1] = compCount; queue[tail++] = curr - 1; }
						if(cx < w - 1 && edges[curr + 1] === 0 && labels[curr + 1] === 0){ labels[curr + 1] = compCount; queue[tail++] = curr + 1; }
						if(cy > 0 && edges[curr - w] === 0 && labels[curr - w] === 0){ labels[curr - w] = compCount; queue[tail++] = curr - w; }
						if(cy < h - 1 && edges[curr + w] === 0 && labels[curr + w] === 0){ labels[curr + w] = compCount; queue[tail++] = curr + w; }
					}

					components.push({ id: compCount, size: count, touchesBorder: touchesBorder, bbox: [minPx, minPy, maxPx, maxPy] });
				}
			}
		}

		// 3. Separate Exterior Background from Internal Cells
		var isBg = new Uint8Array(compCount + 1);
		for(var ci = 0; ci < components.length; ci++){
			if(components[ci].touchesBorder) isBg[components[ci].id] = 1;
		}

		var internalCells = [];
		for(var ci = 0; ci < components.length; ci++){
			var c = components[ci];
			if(!c.touchesBorder && c.size >= minRegionArea){
				internalCells.push(c);
			}
		}

		var rawCandidateLayers = [];

		// If internal cells were identified: cluster connected cells into Objects via Union-Find
		if(internalCells.length > 0){
			var parent = new Int32Array(compCount + 1);
			for(var i = 1; i <= compCount; i++) parent[i] = i;
			function findRoot(i){
				var root = i;
				while(root !== parent[root]) root = parent[root];
				var curr = i;
				while(curr !== root){ var nxt = parent[curr]; parent[curr] = root; curr = nxt; }
				return root;
			}
			function unionRoot(i, j){
				var ri = findRoot(i), rj = findRoot(j);
				if(ri !== rj) parent[ri] = rj;
			}

			// Scan edges to connect adjacent cells
			for(var y = 0; y < h; y++){
				var rRow = y * w;
				for(var x = 0; x < w; x++){
					var p = rRow + x;
					if(edges[p] === 1){
						var cFirst = 0;
						for(var dy = -1; dy <= 1; dy++){
							var ny = y + dy;
							if(ny < 0 || ny >= h) continue;
							var nRow = ny * w;
							for(var dx = -1; dx <= 1; dx++){
								var nx = x + dx;
								if(nx < 0 || nx >= w) continue;
								var nComp = labels[nRow + nx];
								if(nComp > 0 && isBg[nComp] === 0){
									if(cFirst === 0){
										cFirst = nComp;
									}else if(cFirst !== nComp){
										unionRoot(cFirst, nComp);
									}
								}
							}
						}
					}
				}
			}

			// Group internal cells by object root
			var objGroups = {};
			for(var ci = 0; ci < internalCells.length; ci++){
				var cell = internalCells[ci];
				var root = findRoot(cell.id);
				if(!objGroups[root]) objGroups[root] = [];
				objGroups[root].push(cell);
			}

			// For each Object: run Iterative Peel-and-Hull Decomposition
			for(var rootKey in objGroups){
				var groupCells = objGroups[rootKey];
				groupCells.sort(function(a, b){ return b.size - a.size; });

				var active = groupCells.map(function(c){ return c.id; });

				while(active.length > 0){
					var primaryCellId = active[0];
					var primaryCellObj = null;
					for(var gi = 0; gi < groupCells.length; gi++){
						if(groupCells[gi].id === primaryCellId){ primaryCellObj = groupCells[gi]; break; }
					}

					var activeSet = new Uint8Array(compCount + 1);
					for(var ai = 0; ai < active.length; ai++) activeSet[active[ai]] = 1;

					// Active cells mask
					var activeMask = new Uint8Array(total);
					for(var p = 0; p < total; p++){
						if(activeSet[labels[p]] === 1) activeMask[p] = 1;
					}

					// 3x3 Dilation of activeMask to enclose adjacent boundary/internal edges
					var dilActive = new Uint8Array(total);
					for(var y = 0; y < h; y++){
						var rRow = y * w;
						for(var x = 0; x < w; x++){
							if(activeMask[rRow + x] === 1){
								for(var dy = -1; dy <= 1; dy++){
									var ny = y + dy;
									if(ny < 0 || ny >= h) continue;
									var nRow = ny * w;
									for(var dx = -1; dx <= 1; dx++){
										var nx = x + dx;
										if(nx < 0 || nx >= w) continue;
										dilActive[nRow + nx] = 1;
									}
								}
							}
						}
					}

					// Obstacle mask: active cells OR (edges AND dilated active cells)
					var obstacle = new Uint8Array(total);
					for(var p = 0; p < total; p++){
						if(activeMask[p] === 1 || (edges[p] === 1 && dilActive[p] === 1)){
							obstacle[p] = 1;
						}
					}

					// Flood fill from image borders across non-obstacle pixels
					var visited = new Uint8Array(total);
					var qHead = 0, qTail = 0;
					for(var x = 0; x < w; x++){
						if(obstacle[x] === 0 && visited[x] === 0){ visited[x] = 1; queue[qTail++] = x; }
						var b = (h - 1) * w + x;
						if(obstacle[b] === 0 && visited[b] === 0){ visited[b] = 1; queue[qTail++] = b; }
					}
					for(var y = 0; y < h; y++){
						var l = y * w;
						if(obstacle[l] === 0 && visited[l] === 0){ visited[l] = 1; queue[qTail++] = l; }
						var r = y * w + (w - 1);
						if(obstacle[r] === 0 && visited[r] === 0){ visited[r] = 1; queue[qTail++] = r; }
					}

					while(qHead < qTail){
						var curr = queue[qHead++];
						var cx = curr % w;
						var cy = (curr / w) | 0;

						if(cx > 0 && obstacle[curr - 1] === 0 && visited[curr - 1] === 0){ visited[curr - 1] = 1; queue[qTail++] = curr - 1; }
						if(cx < w - 1 && obstacle[curr + 1] === 0 && visited[curr + 1] === 0){ visited[curr + 1] = 1; queue[qTail++] = curr + 1; }
						if(cy > 0 && obstacle[curr - w] === 0 && visited[curr - w] === 0){ visited[curr - w] = 1; queue[qTail++] = curr - w; }
						if(cy < h - 1 && obstacle[curr + w] === 0 && visited[curr + w] === 0){ visited[curr + w] = 1; queue[qTail++] = curr + w; }
					}

					// Hull pixels are visited === 0
					var minHx = w, maxHx = 0, minHy = h, maxHy = 0;
					var hCount = 0;
					for(var p = 0; p < total; p++){
						if(visited[p] === 0){
							hCount++;
							var x = p % w;
							var y = (p / w) | 0;
							if(x < minHx) minHx = x;
							if(x > maxHx) maxHx = x;
							if(y < minHy) minHy = y;
							if(y > maxHy) maxHy = y;
						}
					}

					if(hCount >= minRegionArea && maxHx >= minHx && maxHy >= minHy){
						// Construct sub-grid Marching Squares nodeGrid with 2px padding
						var subMinX = Math.max(0, minHx - 2);
						var subMinY = Math.max(0, minHy - 2);
						var subMaxX = Math.min(w - 1, maxHx + 2);
						var subMaxY = Math.min(h - 1, maxHy + 2);
						var sw = subMaxX - subMinX + 1;
						var sh = subMaxY - subMinY + 1;

						var nodeGrid = [];
						for(var j = 0; j < sh + 2; j++) nodeGrid[j] = new Uint8Array(sw + 2);

						for(var j = 1; j < sh + 1; j++){
							var y0 = subMinY + j - 2;
							var y1 = subMinY + j - 1;
							for(var i = 1; i < sw + 1; i++){
								var x0 = subMinX + i - 2;
								var x1 = subMinX + i - 1;

								var p00 = (y0 >= 0 && y0 < h && x0 >= 0 && x0 < w && visited[y0 * w + x0] === 0) ? 1 : 0;
								var p01 = (y0 >= 0 && y0 < h && x1 >= 0 && x1 < w && visited[y0 * w + x1] === 0) ? 1 : 0;
								var p10 = (y1 >= 0 && y1 < h && x0 >= 0 && x0 < w && visited[y1 * w + x0] === 0) ? 1 : 0;
								var p11 = (y1 >= 0 && y1 < h && x1 >= 0 && x1 < w && visited[y1 * w + x1] === 0) ? 1 : 0;

								nodeGrid[j][i] = p00 + (p01 * 2) + (p10 * 8) + (p11 * 4);
							}
						}

						var rawPaths = _this.pathscan(nodeGrid, pathomit, options);
						var outerPaths = [];
						for(var pi = 0; pi < rawPaths.length; pi++){
							var pth = rawPaths[pi];
							if(!pth.isholepath && pth.points && pth.points.length >= 3){
								outerPaths.push(pth);
							}
						}

						if(outerPaths.length > 0){
							outerPaths.sort(function(a, b){
								return _this.polygonArea(b.points) - _this.polygonArea(a.points);
							});
							var bestPth = outerPaths[0];
							var shiftedPoints = [];
							for(var pt = 0; pt < bestPth.points.length; pt++){
								shiftedPoints.push({
									x: bestPth.points[pt].x + subMinX - 1,
									y: bestPth.points[pt].y + subMinY - 1
								});
							}
							var hullBbox = [minHx, minHy, maxHx, maxHy];
							var hullArea = _this.polygonArea(shiftedPoints);

							// Circular Polylabel filter check
							var passSpeckle = true;
							if(speckleRadius > 0 && !_this.canContainCircle(shiftedPoints, hullBbox, speckleRadius)){
								passSpeckle = false;
							}

							if(passSpeckle && hullArea >= minRegionArea){
								// Determine dominant palette color of the primary cell
								var domColor = null;
								if(primaryCellObj && palette && palette.length > 0){
									var counts = new Int32Array(palette.length);
									var totalSampled = 0;
									var cy0 = primaryCellObj.bbox[1], cy1 = primaryCellObj.bbox[3];
									var cx0 = primaryCellObj.bbox[0], cx1 = primaryCellObj.bbox[2];
									for(var sy = cy0; sy <= cy1; sy++){
										var sRow = sy * w;
										for(var sx = cx0; sx <= cx1; sx++){
											if(labels[sRow + sx] === primaryCellId){
												var cIdx = ii.array[sy + 1][sx + 1];
												if(cIdx >= 0 && cIdx < palette.length){
													counts[cIdx]++;
													totalSampled++;
												}
											}
										}
									}
									if(totalSampled > 0){
										var bCount = -1, bIdx = 0;
										for(var c = 0; c < palette.length; c++){
											if(counts[c] > bCount){ bCount = counts[c]; bIdx = c; }
										}
										domColor = { index: bIdx, color: palette[bIdx] };
									}
								}
								if(!domColor){
									domColor = _this.getDominantPaletteColor(shiftedPoints, hullBbox, ii, palette);
								}

								rawCandidateLayers.push({
									points: shiftedPoints,
									boundingbox: hullBbox,
									area: hullArea,
									color: domColor.color,
									colorIndex: domColor.index
								});
							}
						}
					}

					// Peel: delete the largest active cell and repeat
					active.shift();
				}
			}
		}

		// Fallback: If no internal cells were extracted (e.g. flat single-color shape or boundary-touching artwork):
		// Extract closed boundary loops from color layers
		if(rawCandidateLayers.length === 0){
			for(var cnum = 0; cnum < palette.length; cnum++){
				var layer = _this.layeringstep(ii, cnum);
				var paths = _this.pathscan(layer, pathomit, options);

				for(var p = 0; p < paths.length; p++){
					var path = paths[p];
					if(!path.points || path.points.length < 3 || path.isholepath) continue;

					var area = _this.polygonArea(path.points);
					if(area < minRegionArea) continue;

					if(speckleRadius > 0 && !_this.canContainCircle(path.points, path.boundingbox, speckleRadius)){
						continue;
					}

					var dom = _this.getDominantPaletteColor(path.points, path.boundingbox, ii, palette);
					rawCandidateLayers.push({
						points: path.points,
						boundingbox: path.boundingbox,
						area: area,
						color: dom.color,
						colorIndex: dom.index
					});
				}
			}
		}

		// 4. Deduplicate candidate layers with nearly identical footprint
		rawCandidateLayers.sort(function(a, b){ return b.area - a.area; });

		var uniqueCandidates = [];
		for(var i = 0; i < rawCandidateLayers.length; i++){
			var cA = rawCandidateLayers[i];
			var isDup = false;
			for(var j = 0; j < uniqueCandidates.length; j++){
				var cB = uniqueCandidates[j];
				if(Math.abs(cA.area - cB.area) / Math.max(cA.area, cB.area) < 0.03){
					var bA = cA.boundingbox, bB = cB.boundingbox;
					if(Math.abs(bA[0] - bB[0]) <= 2 && Math.abs(bA[1] - bB[1]) <= 2 &&
					   Math.abs(bA[2] - bB[2]) <= 2 && Math.abs(bA[3] - bB[3]) <= 2){
						isDup = true;
						break;
					}
				}
			}
			if(!isDup){
				uniqueCandidates.push(cA);
			}
		}

		// 5. Area-Descending Sort Order (Largest Area = Index 0 = Bottom Layer)
		uniqueCandidates.sort(function(a, b){ return b.area - a.area; });

		if(options.maxlayers && options.maxlayers > 0 && uniqueCandidates.length > options.maxlayers){
			uniqueCandidates = uniqueCandidates.slice(0, options.maxlayers);
		}

		// 6. Fit curves to each solid region according to edgeStyle (Organic Bézier vs Geometric Polygonal)
		var finalLayers = [];
		var finalPalette = [];

		for(var k = 0; k < uniqueCandidates.length; k++){
			var cand = uniqueCandidates[k];
			var rawPath = {
				points: cand.points,
				boundingbox: cand.boundingbox,
				holechildren: [], // ALWAYS solid shape (no cutouts)
				isholepath: false
			};

			var fittedPath;
			if(edgeStyle === 'geometric' || options.curvealgorithm === 'geometric'){
				fittedPath = _this.geometricTracePath(rawPath, options.ltres, options);
			}else if(options.curvealgorithm === 'standard'){
				fittedPath = _this.standardTracePath(rawPath, options.ltres, options.qtres);
			}else{
				fittedPath = _this.potraceTracePath(rawPath, options.ltres, options.qtres, options);
			}

			// Guarantee solid shape properties
			fittedPath.holechildren = [];
			fittedPath.isholepath = false;

			if(fittedPath.segments && fittedPath.segments.length > 0){
				finalPalette.push(cand.color);
				finalLayers.push([fittedPath]);
			}
		}

		return {
			layers: finalLayers,
			palette: finalPalette,
			width: w,
			height: h
		};
	};
	
	////////////////////////////////////////////////////////////
	//
	//  SVG Drawing functions
	//
	////////////////////////////////////////////////////////////
	
	// Rounding to given decimals https://stackoverflow.com/questions/11832914/round-to-at-most-2-decimal-places-in-javascript
	this.roundtodec = function(val,places){ return +val.toFixed(places); },
	
	// Getting SVG path element string from a traced path
	this.svgpathstring = function( tracedata, lnum, pathnum, options ){
		
		var layer = tracedata.layers[lnum], smp = layer[pathnum], str='', pcnt;
		
		// Line filter
		if(options.linefilter && (smp.segments.length < 3)){ return str; }
		
		// Starting path element, desc contains layer and path number
		str = '<path '+
			( options.desc ? ('desc="l '+lnum+' p '+pathnum+'" ') : '' ) +
			_this.tosvgcolorstr(tracedata.palette[lnum], options) +
			'd="';
		
		// Creating non-hole path string
		if( options.roundcoords === -1 ){
			str += 'M '+ smp.segments[0].x1 * options.scale +' '+ smp.segments[0].y1 * options.scale +' ';
			for(pcnt=0; pcnt<smp.segments.length; pcnt++){
				str += smp.segments[pcnt].type +' '+ smp.segments[pcnt].x2 * options.scale +' '+ smp.segments[pcnt].y2 * options.scale +' ';
				if(smp.segments[pcnt].hasOwnProperty('x3')){
					str += smp.segments[pcnt].x3 * options.scale +' '+ smp.segments[pcnt].y3 * options.scale +' ';
				}
			}
			str += 'Z ';
		}else{
			str += 'M '+ _this.roundtodec( smp.segments[0].x1 * options.scale, options.roundcoords ) +' '+ _this.roundtodec( smp.segments[0].y1 * options.scale, options.roundcoords ) +' ';
			for(pcnt=0; pcnt<smp.segments.length; pcnt++){
				str += smp.segments[pcnt].type +' '+ _this.roundtodec( smp.segments[pcnt].x2 * options.scale, options.roundcoords ) +' '+ _this.roundtodec( smp.segments[pcnt].y2 * options.scale, options.roundcoords ) +' ';
				if(smp.segments[pcnt].hasOwnProperty('x3')){
					str += _this.roundtodec( smp.segments[pcnt].x3 * options.scale, options.roundcoords ) +' '+ _this.roundtodec( smp.segments[pcnt].y3 * options.scale, options.roundcoords ) +' ';
				}
			}
			str += 'Z ';
		}// End of creating non-hole path string
		
		// Hole children
		for( var hcnt=0; hcnt < smp.holechildren.length; hcnt++){
			var hsmp = layer[ smp.holechildren[hcnt] ];
			// Creating hole path string
			if( options.roundcoords === -1 ){
				
				if(hsmp.segments[ hsmp.segments.length-1 ].hasOwnProperty('x3')){
					str += 'M '+ hsmp.segments[ hsmp.segments.length-1 ].x3 * options.scale +' '+ hsmp.segments[ hsmp.segments.length-1 ].y3 * options.scale +' ';
				}else{
					str += 'M '+ hsmp.segments[ hsmp.segments.length-1 ].x2 * options.scale +' '+ hsmp.segments[ hsmp.segments.length-1 ].y2 * options.scale +' ';
				}
				
				for(pcnt = hsmp.segments.length-1; pcnt >= 0; pcnt--){
					str += hsmp.segments[pcnt].type +' ';
					if(hsmp.segments[pcnt].hasOwnProperty('x3')){
						str += hsmp.segments[pcnt].x2 * options.scale +' '+ hsmp.segments[pcnt].y2 * options.scale +' ';
					}
					
					str += hsmp.segments[pcnt].x1 * options.scale +' '+ hsmp.segments[pcnt].y1 * options.scale +' ';
				}
				
			}else{
				
				if(hsmp.segments[ hsmp.segments.length-1 ].hasOwnProperty('x3')){
					str += 'M '+ _this.roundtodec( hsmp.segments[ hsmp.segments.length-1 ].x3 * options.scale ) +' '+ _this.roundtodec( hsmp.segments[ hsmp.segments.length-1 ].y3 * options.scale ) +' ';
				}else{
					str += 'M '+ _this.roundtodec( hsmp.segments[ hsmp.segments.length-1 ].x2 * options.scale ) +' '+ _this.roundtodec( hsmp.segments[ hsmp.segments.length-1 ].y2 * options.scale ) +' ';
				}
				
				for(pcnt = hsmp.segments.length-1; pcnt >= 0; pcnt--){
					str += hsmp.segments[pcnt].type +' ';
					if(hsmp.segments[pcnt].hasOwnProperty('x3')){
						str += _this.roundtodec( hsmp.segments[pcnt].x2 * options.scale ) +' '+ _this.roundtodec( hsmp.segments[pcnt].y2 * options.scale ) +' ';
					}
					str += _this.roundtodec( hsmp.segments[pcnt].x1 * options.scale ) +' '+ _this.roundtodec( hsmp.segments[pcnt].y1 * options.scale ) +' ';
				}
				
				
			}// End of creating hole path string
			
			str += 'Z '; // Close path
			
		}// End of holepath check
		
		// Closing path element
		str += '" />';
		
		// Rendering control points
		if(options.lcpr || options.qcpr){
			for(pcnt=0; pcnt<smp.segments.length; pcnt++){
				if( smp.segments[pcnt].hasOwnProperty('x3') && options.qcpr ){
					str += '<circle cx="'+ smp.segments[pcnt].x2 * options.scale +'" cy="'+ smp.segments[pcnt].y2 * options.scale +'" r="'+ options.qcpr +'" fill="cyan" stroke-width="'+ options.qcpr * 0.2 +'" stroke="black" />';
					str += '<circle cx="'+ smp.segments[pcnt].x3 * options.scale +'" cy="'+ smp.segments[pcnt].y3 * options.scale +'" r="'+ options.qcpr +'" fill="white" stroke-width="'+ options.qcpr * 0.2 +'" stroke="black" />';
					str += '<line x1="'+ smp.segments[pcnt].x1 * options.scale +'" y1="'+ smp.segments[pcnt].y1 * options.scale +'" x2="'+ smp.segments[pcnt].x2 * options.scale +'" y2="'+ smp.segments[pcnt].y2 * options.scale +'" stroke-width="'+ options.qcpr * 0.2 +'" stroke="cyan" />';
					str += '<line x1="'+ smp.segments[pcnt].x2 * options.scale +'" y1="'+ smp.segments[pcnt].y2 * options.scale +'" x2="'+ smp.segments[pcnt].x3 * options.scale +'" y2="'+ smp.segments[pcnt].y3 * options.scale +'" stroke-width="'+ options.qcpr * 0.2 +'" stroke="cyan" />';
				}
				if( (!smp.segments[pcnt].hasOwnProperty('x3')) && options.lcpr){
					str += '<circle cx="'+ smp.segments[pcnt].x2 * options.scale +'" cy="'+ smp.segments[pcnt].y2 * options.scale +'" r="'+ options.lcpr +'" fill="white" stroke-width="'+ options.lcpr * 0.2 +'" stroke="black" />';
				}
			}
			
			// Hole children control points
			for( var hcnt=0; hcnt < smp.holechildren.length; hcnt++){
				var hsmp = layer[ smp.holechildren[hcnt] ];
				for(pcnt=0; pcnt<hsmp.segments.length; pcnt++){
					if( hsmp.segments[pcnt].hasOwnProperty('x3') && options.qcpr ){
						str += '<circle cx="'+ hsmp.segments[pcnt].x2 * options.scale +'" cy="'+ hsmp.segments[pcnt].y2 * options.scale +'" r="'+ options.qcpr +'" fill="cyan" stroke-width="'+ options.qcpr * 0.2 +'" stroke="black" />';
						str += '<circle cx="'+ hsmp.segments[pcnt].x3 * options.scale +'" cy="'+ hsmp.segments[pcnt].y3 * options.scale +'" r="'+ options.qcpr +'" fill="white" stroke-width="'+ options.qcpr * 0.2 +'" stroke="black" />';
						str += '<line x1="'+ hsmp.segments[pcnt].x1 * options.scale +'" y1="'+ hsmp.segments[pcnt].y1 * options.scale +'" x2="'+ hsmp.segments[pcnt].x2 * options.scale +'" y2="'+ hsmp.segments[pcnt].y2 * options.scale +'" stroke-width="'+ options.qcpr * 0.2 +'" stroke="cyan" />';
						str += '<line x1="'+ hsmp.segments[pcnt].x2 * options.scale +'" y1="'+ hsmp.segments[pcnt].y2 * options.scale +'" x2="'+ hsmp.segments[pcnt].x3 * options.scale +'" y2="'+ hsmp.segments[pcnt].y3 * options.scale +'" stroke-width="'+ options.qcpr * 0.2 +'" stroke="cyan" />';
					}
					if( (!hsmp.segments[pcnt].hasOwnProperty('x3')) && options.lcpr){
						str += '<circle cx="'+ hsmp.segments[pcnt].x2 * options.scale +'" cy="'+ hsmp.segments[pcnt].y2 * options.scale +'" r="'+ options.lcpr +'" fill="white" stroke-width="'+ options.lcpr * 0.2 +'" stroke="black" />';
					}
				}
			}
		}// End of Rendering control points
			
		return str;
		
	},// End of svgpathstring()
	
	// Converting tracedata to an SVG string
	this.getsvgstring = function( tracedata, options ){
		
		options = _this.checkoptions(options);
		
		var w = tracedata.width * options.scale, h = tracedata.height * options.scale;
		
		// SVG start
		var svgstr = '<svg ' + (options.viewbox ? ('viewBox="0 0 '+w+' '+h+'" ') : ('width="'+w+'" height="'+h+'" ')) +
			'version="1.1" xmlns="http://www.w3.org/2000/svg" desc="Created with imagetracer.js version '+_this.versionnumber+'" >';

		// Drawing: Layers and Paths loops
		for(var lcnt=0; lcnt < tracedata.layers.length; lcnt++){
			for(var pcnt=0; pcnt < tracedata.layers[lcnt].length; pcnt++){
				
				// Adding SVG <path> string
				if( !tracedata.layers[lcnt][pcnt].isholepath ){
					svgstr += _this.svgpathstring( tracedata, lcnt, pcnt, options );
				}
					
			}// End of paths loop
		}// End of layers loop
		
		// SVG End
		svgstr+='</svg>';
		
		return svgstr;
		
	},// End of getsvgstring()
	
	// Comparator for numeric Array.sort
	this.compareNumbers = function(a,b){ return a - b; },
	
	// Convert color object to rgba string
	this.torgbastr = function(c){ return 'rgba('+c.r+','+c.g+','+c.b+','+c.a+')'; },
	
	// Convert color object to SVG color string
	this.tosvgcolorstr = function(c, options){
		return 'fill="rgb('+c.r+','+c.g+','+c.b+')" stroke="rgb('+c.r+','+c.g+','+c.b+')" stroke-width="'+options.strokewidth+'" opacity="'+c.a/255.0+'" ';
	},
	
	// Helper function: Appending an <svg> element to a container from an svgstring
	this.appendSVGString = function(svgstr,parentid){
		var div;
		if(parentid){
			div = document.getElementById(parentid);
			if(!div){
				div = document.createElement('div');
				div.id = parentid;
				document.body.appendChild(div);
			}
		}else{
			div = document.createElement('div');
			document.body.appendChild(div);
		}
		div.innerHTML += svgstr;
	},
	
	////////////////////////////////////////////////////////////
	//
	//  Canvas functions
	//
	////////////////////////////////////////////////////////////
	
	// Gaussian kernels for blur
	this.gks = [ [0.27901,0.44198,0.27901], [0.135336,0.228569,0.272192,0.228569,0.135336], [0.086776,0.136394,0.178908,0.195843,0.178908,0.136394,0.086776],
	             [0.063327,0.093095,0.122589,0.144599,0.152781,0.144599,0.122589,0.093095,0.063327], [0.049692,0.069304,0.089767,0.107988,0.120651,0.125194,0.120651,0.107988,0.089767,0.069304,0.049692] ],
	
	// Selective Gaussian blur for preprocessing
	this.blur = function(imgd,radius,delta){
		var i,j,k,d,idx,racc,gacc,bacc,aacc,wacc;
		
		// new ImageData
		var imgd2 = { width:imgd.width, height:imgd.height, data:[] };
		
		// radius and delta limits, this kernel
		radius = Math.floor(radius); if(radius<1){ return imgd; } if(radius>5){ radius = 5; } delta = Math.abs( delta ); if(delta>1024){ delta = 1024; }
		var thisgk = _this.gks[radius-1];
		
		// loop through all pixels, horizontal blur
		for( j=0; j < imgd.height; j++ ){
			for( i=0; i < imgd.width; i++ ){

				racc = 0; gacc = 0; bacc = 0; aacc = 0; wacc = 0;
				// gauss kernel loop
				for( k = -radius; k < radius+1; k++){
					// add weighted color values
					if( (i+k > 0) && (i+k < imgd.width) ){
						idx = (j*imgd.width+i+k)*4;
						racc += imgd.data[idx  ] * thisgk[k+radius];
						gacc += imgd.data[idx+1] * thisgk[k+radius];
						bacc += imgd.data[idx+2] * thisgk[k+radius];
						aacc += imgd.data[idx+3] * thisgk[k+radius];
						wacc += thisgk[k+radius];
					}
				}
				// The new pixel
				idx = (j*imgd.width+i)*4;
				imgd2.data[idx  ] = Math.floor(racc / wacc);
				imgd2.data[idx+1] = Math.floor(gacc / wacc);
				imgd2.data[idx+2] = Math.floor(bacc / wacc);
				imgd2.data[idx+3] = Math.floor(aacc / wacc);
				
			}// End of width loop
		}// End of horizontal blur
		
		// copying the half blurred imgd2
		var himgd = new Uint8ClampedArray(imgd2.data);
		
		// loop through all pixels, vertical blur
		for( j=0; j < imgd.height; j++ ){
			for( i=0; i < imgd.width; i++ ){

				racc = 0; gacc = 0; bacc = 0; aacc = 0; wacc = 0;
				// gauss kernel loop
				for( k = -radius; k < radius+1; k++){
					// add weighted color values
					if( (j+k > 0) && (j+k < imgd.height) ){
						idx = ((j+k)*imgd.width+i)*4;
						racc += himgd[idx  ] * thisgk[k+radius];
						gacc += himgd[idx+1] * thisgk[k+radius];
						bacc += himgd[idx+2] * thisgk[k+radius];
						aacc += himgd[idx+3] * thisgk[k+radius];
						wacc += thisgk[k+radius];
					}
				}
				// The new pixel
				idx = (j*imgd.width+i)*4;
				imgd2.data[idx  ] = Math.floor(racc / wacc);
				imgd2.data[idx+1] = Math.floor(gacc / wacc);
				imgd2.data[idx+2] = Math.floor(bacc / wacc);
				imgd2.data[idx+3] = Math.floor(aacc / wacc);
				
			}// End of width loop
		}// End of vertical blur
		
		// Selective blur: loop through all pixels
		for( j=0; j < imgd.height; j++ ){
			for( i=0; i < imgd.width; i++ ){
				
				idx = (j*imgd.width+i)*4;
				// d is the difference between the blurred and the original pixel
				d = Math.abs(imgd2.data[idx  ] - imgd.data[idx  ]) + Math.abs(imgd2.data[idx+1] - imgd.data[idx+1]) +
					Math.abs(imgd2.data[idx+2] - imgd.data[idx+2]) + Math.abs(imgd2.data[idx+3] - imgd.data[idx+3]);
				// selective blur: if d>delta, put the original pixel back
				if(d>delta){
					imgd2.data[idx  ] = imgd.data[idx  ];
					imgd2.data[idx+1] = imgd.data[idx+1];
					imgd2.data[idx+2] = imgd.data[idx+2];
					imgd2.data[idx+3] = imgd.data[idx+3];
				}
			}
		}// End of Selective blur
		
		return imgd2;
		
	},// End of blur()
	
	// Helper function: loading an image from a URL, then executing callback with canvas as argument
	this.loadImage = function(url,callback,options){
		var img = new Image();
		if(options && options.corsenabled){ img.crossOrigin = 'Anonymous'; }
		img.onload = function(){
			var canvas = document.createElement('canvas');
			canvas.width = img.width;
			canvas.height = img.height;
			var context = canvas.getContext('2d');
			context.drawImage(img,0,0);
			callback(canvas);
		};
		img.src = url;
	},
	
	// Helper function: getting ImageData from a canvas
	this.getImgdata = function(canvas){
		var context = canvas.getContext('2d');
		return context.getImageData(0,0,canvas.width,canvas.height);
	},
	
	// Special palette to use with drawlayers()
	this.specpalette = [
		{r:0,g:0,b:0,a:255}, {r:128,g:128,b:128,a:255}, {r:0,g:0,b:128,a:255}, {r:64,g:64,b:128,a:255},
		{r:192,g:192,b:192,a:255}, {r:255,g:255,b:255,a:255}, {r:128,g:128,b:192,a:255}, {r:0,g:0,b:192,a:255},
		{r:128,g:0,b:0,a:255}, {r:128,g:64,b:64,a:255}, {r:128,g:0,b:128,a:255}, {r:168,g:168,b:168,a:255},
		{r:192,g:128,b:128,a:255}, {r:192,g:0,b:0,a:255}, {r:255,g:255,b:255,a:255}, {r:0,g:128,b:0,a:255}
	],
	
	// Helper function: Drawing all edge node layers into a container
	this.drawLayers = function(layers,palette,scale,parentid){
		scale = scale||1;
		var w,h,i,j,k;
		
		// Preparing container
		var div;
		if(parentid){
			div = document.getElementById(parentid);
			if(!div){
				div = document.createElement('div');
				div.id = parentid;
				document.body.appendChild(div);
			}
		}else{
			div = document.createElement('div');
			document.body.appendChild(div);
		}
		
		// Layers loop
		for (k in layers) {
			if(!layers.hasOwnProperty(k)){ continue; }
			
			// width, height
			w=layers[k][0].length; h=layers[k].length;
			
			// Creating new canvas for every layer
			var canvas = document.createElement('canvas'); canvas.width=w*scale; canvas.height=h*scale;
			var context = canvas.getContext('2d');
			
			// Drawing
			for(j=0; j<h; j++){
				for(i=0; i<w; i++){
					context.fillStyle = _this.torgbastr(palette[ layers[k][j][i]%palette.length ]);
					context.fillRect(i*scale,j*scale,scale,scale);
				}
			}
			
			// Appending canvas to container
			div.appendChild(canvas);
		}// End of Layers loop
	}// End of drawlayers
	
	;// End of function list
	
}// End of ImageTracer object

// export as AMD module / Node module / browser or worker variable
if(typeof define === 'function' && define.amd){
	define(function() { return new ImageTracer(); });
}else if(typeof module !== 'undefined'){
	module.exports = new ImageTracer();
}else if(typeof self !== 'undefined'){
	self.ImageTracer = new ImageTracer();
}else window.ImageTracer = new ImageTracer();

})();