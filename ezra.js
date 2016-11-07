var bibleRefReader = new BibleRefReader(BIBLE_ABBR, CHINESE_NUM_VAL, CHINESE_EXP_VAL);
var bodyTextNodes = getTextNodesIn(document.body);
for (var i = 0; i < bodyTextNodes.length; i++) {
  if (bodyTextNodes[i].parentNode.nodeName !== 'A') {
    var linkifiedHtml = bodyTextNodes[i].nodeValue.replace(
      new RegExp(bibleRefReader.regexPattern, 'g'), "<a href='#' title='載入中...($&)'>$&</a>");
    var linkifiedNodes = createNodes(linkifiedHtml);
    var linksCreated = linkifiedNodes.length > 1;
    if (linksCreated) {
      replaceWithNodes(bodyTextNodes[i], linkifiedNodes);
    }
  }
}

$(document).tooltip({
  open: function (event, ui) {
    if (typeof (event.originalEvent) === 'undefined') {
      return false;
    }
    // close any lingering tooltips
    var thisTooltip = '#' + $(ui.tooltip).attr('id');
    $('div.ui-tooltip').not(thisTooltip).remove();

    var ref = bibleRefReader.readRef($(ui.tooltip).text());
    ref.getBibleText(function (bibleText) {
      $(ui.tooltip).html(
        bibleText
        + "<div class='bibleRefSeperator'></div>"
        + "<div class='bibleRefFooter'><a href='#'>關於</a></div>");
    });
  },
  close: function (event, ui) {
    // keep tooltip open on hover
    ui.tooltip.hover(
      function () {
        $(this).stop(true).fadeTo(400, 1);
      },
      function () {
        $(this).fadeOut('400', function () {
          $(this).remove();
        });
      }
    );
  },
});

function BibleRefReader(abbr, chiNumVal, chiExpVal) {
  var books = Object.keys(abbr);
  var abbrs = books.map(function (book) { return abbr[book]; });
  var bibleBooks = books.concat(abbrs).join('|');
  var chiNum = Object.keys(chiNumVal);
  var chiExp = Object.keys(chiExpVal);
  var chineseNums = chiNum.concat(chiExp).join();
  var lastAbbr = '';

  this.regexPattern = '(' + bibleBooks + '|，) ?([' + chineseNums + ']+|\\d+)[ :：︰]?([\\d-─,、 ]+)';
  this.readRef = function (ref) {
    var match = new RegExp(this.regexPattern).exec(ref);
    return new BibleRef(
      this.readAbbr(match[1]),
      this.readChap(match[2]),
      this.readVers(match[3]));
  }
  this.readAbbr = function (book) {
    var curAbbr = abbr[book];
    if (curAbbr === undefined) {
      curAbbr = abbrs.indexOf(book) >= 0 ? book : lastAbbr;
    }
    lastAbbr = curAbbr;
    return curAbbr;
  };
  this.readChap = function (num) {
    if (!isNaN(num)) {
      return +num;
    }
    else {
      var acc = [];
      for (var i in num) {
        if (num.hasOwnProperty(i)) {
          var n = num[i];
          if (chiNum.indexOf(n) >= 0) {
            acc.push(chiNumVal[n]);
          } else if (chiExp.indexOf(n) >= 0) {
            if (acc.length === 0) {
              acc.push(1);
            }
            acc[acc.length - 1] *= chiExpVal[n];
          }
        }
      }
      return acc.reduce((a, b) => a + b);
    }
  };
  this.readVers = function (vers) {
    return vers.replace(/─/g, '-')
      .replace(/、/g, ',')
      .replace(/ /g, '');
  };
}

BibleRef.versesCache = {};
function BibleRef(abbr, chap, vers) {
  var refText = '(' + abbr + ' ' + chap + ':' + vers + ')';
  this.getBibleText = function (callback) {
    var cache = BibleRef.versesCache;
    if (cache.hasOwnProperty(refText)) {
      callback(cache[refText]);
    } else {
      getBibleTextFromFHL(function (text) {
        cache[refText] = text;
        callback(text);
      }, callback);
    }
  };
  var getBibleTextFromFHL = function (success, fail) {
    var xhr = new XMLHttpRequest();
    xhr.onload = function () {
      if (xhr.status == 200) {
        var resp = JSON.parse(xhr.responseText);
        try {
          if (resp.status === 'success') {
            var versesText = '';
            var lastSec = 0;
            for (var i = 0; i < resp.record.length; i++) {
              var record = resp.record[i];
              if (i > 0 && record.sec > lastSec + 1) {
                versesText += '⋯⋯';
              }
              lastSec = record.sec;
              versesText += record.bible_text;
            }
            success(versesText + refText);
          } else {
            fail('未能查訽經文: FHL response text = ' + xhr.responseText);
          }
        }
        catch (err) {
          fail('未能查訽經文: ' + err);
        }
      } else {
        fail('未能查訽經文: XHR status = ' + xhr.status);
      }
    };
    xhr.open("GET", 'https://bible.fhl.net/json/qb.php?chineses=' + abbr + '&chap=' + chap + '&sec=' + vers, true);
    xhr.send();
  };
}

function getTextNodesIn(node, includeWhitespaceNodes) {
  var textNodes = [];
  function getTextNodes(node) {
    if (node.nodeType == 3) {
      textNodes.push(node);
    } else {
      for (var i = 0; i < node.childNodes.length; i++) {
        getTextNodes(node.childNodes[i]);
      }
    }
  }
  getTextNodes(node);
  return textNodes;
}

function createNodes(html) {
  // assuming html containing only text nodes and anchor, so it is safe to put it in div
  var dummy = document.createElement('div');
  dummy.innerHTML = html;
  return dummy.childNodes;
}

function replaceWithNodes(oldNode, newNodes) {
  for (var i = newNodes.length - 1; i > 0; i--) {
    oldNode.parentNode.insertBefore(newNodes[i], oldNode.nextSibling);
  }
  oldNode.parentNode.replaceChild(newNodes[0], oldNode);
}