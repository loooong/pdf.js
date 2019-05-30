/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

//
// Basic node example that prints document metadata and text content.
// Requires single file built version of PDF.js -- please run
// `gulp singlefile` before running the example.
//

// Run `gulp dist-install` to generate 'pdfjs-dist' npm package files.

var pdfjsLib = require('pdfjs-dist');
var Canvas = require('../../node_modules/canvas');
var assert = require('assert');
const fs = require('fs');
// const Jimp = require('Jimp');

function NodeCanvasFactory() {
}

NodeCanvasFactory.prototype = {
  create: function NodeCanvasFactory_create(width, height) {
    assert(width > 0 && height > 0, 'Invalid canvas size');
    var canvas = Canvas.createCanvas(width, height);
    var context = canvas.getContext('2d');
    return {
      canvas,
      context,
    };
  },

  reset: function NodeCanvasFactory_reset(canvasAndContext, width, height) {
    assert(canvasAndContext.canvas, 'Canvas is not specified');
    assert(width > 0 && height > 0, 'Invalid canvas size');
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  },

  destroy: function NodeCanvasFactory_destroy(canvasAndContext) {
    assert(canvasAndContext.canvas, 'Canvas is not specified');

    // Zeroing the width and height cause Firefox to release graphics
    // resources immediately, which can greatly reduce memory consumption.
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  },
};

// Loading file from file system into typed array
var pdfPath = process.argv[2] || 'ypdf/1page_img.pdf';

// Will be using promises to load document, pages and misc data instead of
// callback.
var loadingTask = pdfjsLib.getDocument(pdfPath);

function extracted(page) {
// Render the page on a Node canvas with 100% scale.
  var viewport = page.getViewport({ scale: 1.0, });
  var canvasFactory = new NodeCanvasFactory();
  var canvasAndContext = canvasFactory.create(viewport.width, viewport.height);
  let gfx = pdfjsLib.CanvasGraphics(canvasAndContext.context, page.commonObjs, page.objs, NodeCanvasFactory);
  gfx.paintJpegXObject('img_p0_3',100,100);
  let fimage = canvasAndContext.canvas.toBuffer();
  fs.writeFileSync("out_image10.png", fimage)

}

loadingTask.promise.then(function (doc) {
  var numPages = doc.numPages;
  console.log('# Document Loaded');
  console.log('Number of Pages: ' + numPages);
  console.log();

  var lastPromise; // will be used to chain promises
  lastPromise = doc.getMetadata().then(function (metaData) {
    console.log('# Metadata Is Loaded');
    console.log('## Info');
    console.log(JSON.stringify(metaData.info, null, 2));
    console.log();
    if (metaData.metadata) {
      console.log('## Metadata');
      console.log(JSON.stringify(metaData.metadata.getAll(), null, 2));
      console.log();
    }
  });

// //////////////////////////////我加入的类
  class MyImageLayer {
    constructor() {
      this.imageArray = [];
    }

    beginLayout() {
      console.log('beginLayout');
    }

    endLayout() {
      console.log('endLayout');
    }

    appendImage(imageObj) {
      // console.log(this.imageArray, "pdf.js 72")
      this.imageArray.push(imageObj); // 加入类
    }
  }

  var loadPage = function (pageNum) {
    let pagePromise = doc.getPage(pageNum);
    return pagePromise.then(function (page) {
      console.log('# Page ' + pageNum);
      page.getOperatorList().then(function (ops) {
        extracted(page);

        let lnfo = page;
        console.log(1);
      });
    }).then(function () {
      console.log('# End of Document');
    }, function (err) {
      console.error('Error: ' + err);
    });
  };
// Loading of the first page will wait on metadata and subsequent loadings
// will wait on the previous pages.
  for (var i = 1; i <= numPages; i++) {
    lastPromise = lastPromise.then(loadPage.bind(null, i));
  }
})
