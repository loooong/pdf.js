/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */
// 本文件是把pdfPage对应的pdf中获到信息。
// （1）json信息存到pJsonPath对应的地址中去。
// （2）每一页的图片信息会生成svg文件，会放到outputDirectory文件夹中。

var fs = require('fs');
var util = require('util');
var path = require('path');
var stream = require('stream');

// HACK few hacks to let PDF.js be loaded not as a module in global space.
require('./domstubs.js').setStubs(global);

// Run `gulp dist-install` to generate 'pdfjs-dist' npm package files.
var pdfjsLib = require('pdfjs-dist');

// Dumps svg outputs to a folder called svgdump
function getFilePathForPage(pageNum) {
  var name = path.basename(pdfPath, path.extname(pdfPath));
  return path.join(outputDirectory, pageNum + '.svg');
}

/**
 * A readable stream which offers a stream representing the serialization of a
 * given DOM element (as defined by domstubs.js).
 *
 * @param {object} options
 * @param {DOMElement} options.svgElement The element to serialize
 */
function ReadableSVGStream(options) {
  if (!(this instanceof ReadableSVGStream)) {
    return new ReadableSVGStream(options);
  }
  stream.Readable.call(this, options);
  this.serializer = options.svgElement.getSerializer();
}
util.inherits(ReadableSVGStream, stream.Readable);
// Implements https://nodejs.org/api/stream.html#stream_readable_read_size_1
ReadableSVGStream.prototype._read = function() {
  var chunk;
  while ((chunk = this.serializer.getNext()) !== null) {
    if (!this.push(chunk)) {
      return;
    }
  }
  this.push(null);
};

// Streams the SVG element to the given file path.
function writeSvgToFile(svgElement, filePath) {
  var readableSvgStream = new ReadableSVGStream({
    svgElement,
  });
  var writableStream = fs.createWriteStream(filePath);
  return new Promise(function(resolve, reject) {
    readableSvgStream.once('error', reject);
    writableStream.once('error', reject);
    writableStream.once('finish', resolve);
    readableSvgStream.pipe(writableStream);
  }).catch(function(err) {
    readableSvgStream = null; // Explicitly null because of v8 bug 6512.
    writableStream.end();
    throw err;
  });
}

const TEXT_OPS = [31, 32, 28, 39, 40, 41, 42, 44, 45, 46, 47];
const ILINE_IMG_OPS = [63, 65];
const XOBJ_OPS = [66, 74, 75, 82, 83, 84, 85, 86, 87];
const NO_OPS_RANGE = [78, 79, 80, 81];

// Loading file from file system into typed array
// var pdfPath = process.argv[2] || '../../web/compressed.tracemonkey-pldi-09.pdf';
/*
process.argv 的前两个元素是node与脚本本身
[ 'D:\\Program Files\\nodejs\\node.exe',
  'D:\\js_dev\\learn\\pdf.js\\test\\long_test\\pdf2pjson.js',
  "'D:\\\\js_dev\\\\learn\\\\pdf.js\\\\test\\\\long_test\\\\ypdf\\\\10101201.pdf'" ]
*/
let pdfPath =  process.argv[2] ||  '\\\\192.168.31.99\\d\\pdf_new\\2018\\02\\01\\1010120180201240394.pdf';
let pJsonPath =  process.argv[3] ||  'D:\\js_dev\\learn\\pdf.js\\test\\long_test\\ypdf\\101012018010277806.json';
var outputDirectory = process.argv[4] || 'D:\\js_dev\\learn\\pdf.js\\test\\long_test\\ypdf\\svgdump';
if(pdfPath && pJsonPath && outputDirectory === false){ // 必须要有参数
  throw "参数不足！"
}

var data = new Uint8Array(fs.readFileSync(pdfPath));

try {
  // Note: This creates a directory only one level deep. If you want to create
  // multiple subdirectories on the fly, use the mkdirp module from npm.
  fs.mkdirSync(outputDirectory);
} catch (e) {
  if (e.code !== 'EEXIST') {
    throw e;
  }
}


// Will be using promises to load document, pages and misc data instead of
// callback.
var loadingTask = pdfjsLib.getDocument({
  data,
  // Try to export JPEG images directly if they don't need any further
  // processing.
  nativeImageDecoderSupport: pdfjsLib.NativeImageDecoding.DISPLAY,
});

function filterOpList(opList) {
  let newOpList = { argsArray: [], fnArray: [], };
  for (i = 0; i < opList.argsArray.length; i++) {
    if (TEXT_OPS.indexOf(opList.fnArray[i]) === -1) {
      newOpList.argsArray.push(opList.argsArray[i]);
      newOpList.fnArray.push(opList.fnArray[i]);
    }
  }
  return newOpList;
}
let allJsonObj = { pages: {}, meta: {}, };
loadingTask.promise.then(function(doc) {

  doc.getMetadata().then((metaData) => {
 allJsonObj.meta = metaData.info;
}).then();
  var numPages = doc.numPages;
  console.log('# Document Loaded');
  console.log('Number of Pages: ' + numPages);
  console.log();
  var lastPromise = Promise.resolve(); // will be used to chain promises
  var loadPage = function (pageNum) {
    return doc.getPage(pageNum).then(function (page) {
      console.log('# Page ' + pageNum);
      var viewport = page.getViewport({ scale: 1.0, });
      console.log('Size: ' + viewport.width + 'x' + viewport.height);
      console.log();
      let pageJsonObj = {};

      return page.getOperatorList().then(function (opList) {
        var svgGfx = new pdfjsLib.SVGGraphics(page.commonObjs, page.objs);
        svgGfx.embedFonts = false;
        // let newOpList = opList
        pageJsonObj.opList = opList;
        page.getTextContent().then((textContent) => {
 pageJsonObj.textContent = textContent;
});
        allJsonObj.pages[pageNum] = pageJsonObj; //
        let newOpList = filterOpList(opList);
        return svgGfx.getSVG(newOpList, viewport).then(function (svg) {
          return writeSvgToFile(svg, getFilePathForPage(pageNum))
            .then(function () {
              console.log('Page: ' + pageNum);
            }, function(err) {
              console.log('Error: ' + err);
            });
        });
      });
    });
  };

  for (var i = 1; i <= numPages; i++) {
    lastPromise = lastPromise.then(loadPage.bind(null, i));
  }
  return lastPromise;
}).then(function () {
  fs.writeFileSync(pJsonPath, JSON.stringify(allJsonObj));

  console.log('# End of Document');
}, function (err) {
  console.error('Error: ' + err);
});
