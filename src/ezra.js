/*! Ezra - Linkifiy Chinese Bible Reference <https://kenhung.github.io/Ezra/>
    Copyright (C) 2016  Ken Hung

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program. If not, see <http://www.gnu.org/licenses/>.
 */
(function (ezraLinkifier, undefined) {
  // Embedding prevents conflicts with  the components of web pages.
  // It is a little bit different from bundling, since the scripts are inserted inside.
  /* {{insert-file:lang.js}} */
  /* global Resources */
  var dropFactory = new DropFactory();
  var bibleRefReader = new BibleRefReader();

  /**
   * Linkify all Bible references text within the DOM of the element.
   * @param {Element} element HTML element to be linkified.
   */
  ezraLinkifier.linkify = function (element) {
    var textNodes = getTextNodesIn(element);
    for (var i = 0; i < textNodes.length; i++) {
      if (textNodes[i].parentNode.nodeName !== 'A') {
        var linkifiedNodes = bibleRefReader.linkify(textNodes[i].nodeValue);
        var hasLink = linkifiedNodes.some(function (node) {
          return node.nodeName === 'A';
        });
        if (hasLink) {
          replaceWithNodes(textNodes[i], linkifiedNodes);
        }
      }
    }
    var ezraLinks = element.querySelectorAll('.ezra-bible-ref-link');
    for (i = 0; i < ezraLinks.length; i++) {
      var link = ezraLinks[i];
      var ref = link.getAttribute('ezra-ref');
      if (ref !== null) {
        dropFactory.create(link, ref);
      }
      else {
        // there should be something wrong if ref is null
        // maybe there is a link inserted manually but ezra-ref is missing
        // consider adding some notice for the site owner
      }
    }
  };

  function DropFactory() {
    /* {{insert-file:tether.min.js}} */
    /* {{insert-file:drop.min.js}} */
    /* global Drop */
    var _Drop = Drop.createContext({
      classPrefix: 'ezra'
    });
  
    this.create = function (link, refText) {
      var drop = new _Drop({
        classes: 'ezra-theme-arrows',
        target: link,
        content: document.createTextNode(refText),
        openOn: 'hover',
        constrainToScrollParent: false,
        tetherOptions: {
          constraints: [
            {
              to: 'window',
              attachment: 'together',
              pin: ['left', 'right']
            }
          ]
        }
      });
      drop.on('open', function () {
        var linkSize = window.getComputedStyle(this.target).fontSize;
        this.content.style.fontSize = linkSize;
        var ref = bibleRefReader.readRef(refText);
        ref.getBibleTextWithRef(function (text) {
          drop.content.innerText = text;
          drop.position();
        });
      });
    };
  }

  // added for unit testing
  ezraLinkifier._BibleRefReader = BibleRefReader;
  ezraLinkifier._AbbrResolver = AbbrResolver;
  ezraLinkifier._ChineseNumParser = ChineseNumParser;

  function BibleRefReader() {
    var abbrResolver = new AbbrResolver();
    var chiNumParser = new ChineseNumParser();

    /**
     * Creates a regular expression for matching Bible references, probably the hardest code to understand in Ezra.
     * @param {string} exp Base regular expression.
     * @param {string} flags Regular expression flags.
     */
    function bibleRefExp(exp, flags) {
      return new RegExp(exp
        .replace('{B}', abbrResolver.bibleBooks) // to match '創世記'/'出埃及記'/'利未記'/'民數記'/'申命記'/.../'創'/'出'/'利'/'民'/'申'...
        .replace('{SB}', Resources.uniChapterRefPattern)
        .replace('{C}', '第?[' + chiNumParser.supportedChars + ']+|\\d+\\s*[{:}]') // to mach '第一章'/'第五篇'/'42:'...
        .replace('{S}', '\\s{:}第')
        .replace('{V}', '[{,}{-}{;}{VE}\\s\\d]*\\d') // to match '1-5'/'1-3, 6'/'1;5'/'1及4節'...
        .replace(/{:}/g, ':：︰篇章')
        .replace('{,}', ',，、和及')
        .replace('{-}', '\\-─–－—~～〜至')
        .replace(/{VE}/g, '節节')
        .replace(/{;}/g, ';；'), flags || '');
    }
    var uniChapterRef = bibleRefExp('({SB})\\s?({C})?[{S}]*({V})[{VE}]?', 'g');
    var multiBibleRef = bibleRefExp('({B})?\\s?({C})[{S}]*({V})[{VE}]?', 'g');
    var bibleRefPattern = '({B})\\s?({C})?[{S}]*({V})[{VE}]?';

    /**
     * Converts text to text nodes with hyperlinks.
     * @param {string} text Text to be linkified.
     */
    this.linkify = function (text) {
      // different bible reference formats are handled: 約1:1 約1:1,2 約1:1;2 約1:2,3:4 約1:2;3:4
      var tempLinkifiedNodes = [];
      var match;
      var lastBook = '';
      var lastIndex = 0;
      while ((match = multiBibleRef.exec(text)) !== null) {
        var ref = match[0];
        // check if verses accidentally matched the next Bible reference
        // for references like "約1:2,3:4", the match is "約1:2,3", the ",3" should not be counted as match  
        var strAfterMatch = text.substring(multiBibleRef.lastIndex); // ":4" in the example
        var verses = match[3].match(/\d+/g); // [2, 3] in the example
        if (strAfterMatch.search(bibleRefExp('\\s*[{:}]{V}')) === 0 && verses.length > 1) {
          var realRef = trimLast(ref, bibleRefExp('[{,}{;}\\s]+' + verses[verses.length - 1]));
          multiBibleRef.lastIndex -= (ref.length - realRef.length);
          ref = realRef;
        }
        var book = match[1];
        if (book !== undefined || lastBook !== '') {
          var titleRef = book !== undefined ? ref : lastBook + ref;
          var link = createLink(ref, titleRef);
        }
        else {
          // if no book is provided (e.g. 4:11), there will be no link created
        }
        var strBeforeMatch = text.substring(lastIndex, match.index);
        tempLinkifiedNodes.push(document.createTextNode(strBeforeMatch));
        tempLinkifiedNodes.push(link || document.createTextNode(ref));
        lastBook = book || lastBook;
        lastIndex = multiBibleRef.lastIndex;
      }
      tempLinkifiedNodes.push(document.createTextNode(text.substring(lastIndex)));
      
      var linkifiedNodes = [];
      // to match books that only has one chapter: '猶 3, 6'/'約叁2'/...
      var linkHtml = createLink('$&', '$&').outerHTML.replace(/&amp;/g, '&');
      for (var temp = 0; temp < tempLinkifiedNodes.length; temp++) {
        var tempNode = tempLinkifiedNodes[temp];
        if (tempNode.nodeName === '#text') {
          var newHtml = tempNode.nodeValue.replace(uniChapterRef, linkHtml);
          var newNodes = htmlToElement(newHtml);
          for (var newN = 0; newN < newNodes.length; newN++) {
            var newNode = newNodes[newN];
            linkifiedNodes.push(newNode);
          }
        }
        else {
          linkifiedNodes.push(tempNode);
        }
      }
      return linkifiedNodes;
    };
    function createLink(text, titleRef) {
      var link = document.createElement('a');
      link.setAttribute('ezra-ref', Resources.loading + '...(' + titleRef + ')');
      link.className = 'ezra-bible-ref-link';
      link.innerText = text;
      return link;
    }
    function trimLast(ref, regex) {
      // preconditions: at least one match
      var matches = ref.match(regex);
      var newIndex = ref.lastIndexOf(matches[matches.length - 1]);
      return ref.substring(0, newIndex);
    }
    /**
     * @param {String} HTML representing a single element
     * @return {Element}
     */
    function htmlToElement(html) {
      var temp = document.createElement('div');
      temp.innerHTML = html;
      return temp.childNodes;
    }

    /**
     * Creates a Bible reference by text.
     * @param {string} ref A Bible reference text.
     */
    this.readRef = function (ref) {
      // preconditions: ref must contains a full bible reference
      var match = bibleRefExp(bibleRefPattern).exec(ref);
      if (match !== null) {
        return new BibleRef(
          abbrResolver.toAbbr(match[1]),
          match[2] !== undefined ? chiNumParser.parse(match[2].replace(bibleRefExp('[{:}\\s]', 'g'), '')) : 1,
          this.readVers(match[3]));
      }
      else {
        return null;
      }
    };

    /**
     * Converts or removes unsupported string for query. (e.g. '1，4' => '1,4' / '1及4節' => '1,4' / ...)
     * @param {string} vers Verses string.
     */
    this.readVers = function (vers) {
      return vers
        .replace(bibleRefExp('[{-}]', 'g'), '-')
        .replace(bibleRefExp('[{,}]', 'g'), ',')
        .replace(bibleRefExp('[{VE}\\s]', 'g'), '');
    };
  }

  function ChineseNumParser() {
    var numVal = { '○': 0, 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    var expVal = { 十: 10, 廿: 20, 卅: 30, 卌: 40, 百: 100 };
    var nums = Object.keys(numVal);
    var exps = Object.keys(expVal);
    this.supportedChars = nums.concat(exps).join('');

    /**
     * Parses a Chinese number.
     * @param {string} num A Chinese number.
     */
    this.parse = function (num) {
      if (!isNaN(num)) {
        return +num;
      }
      else {
        if (containsExp(num)) {
          var acc = [];
          for (var i = 0; i < num.length; i++) {
            var n = num[i];
            if (isExp(n)) {
              if (acc.length === 0) {
                acc.push(1);
              }
              acc[acc.length - 1] *= expVal[n];
            } else {
              acc.push(numVal[n] || 0);
            }
          }
          return sumOf(acc);
        }
        else {
          var intStr = num.split('').map(function (n) { return numVal[n]; }).join('');
          return parseInt(intStr, 10);
        }
      }
    };
    function containsExp(num) {
      for (var i = 0; i < num.length; i++) {
        if (expVal[num[i]]) {
          return true;
        }
      }
      return false;
    }
    function isExp(num) { return expVal[num] ? true : false; }
    function sumOf(nums) {
      var sum = 0;
      for (var i = 0; i < nums.length; i++) {
        sum += nums[i];
      }
      return sum;
    }
  }

  /**
   * A Bible reference containing one or multiple verse.
   * @constructor
   * @param {string} abbr Book of Bible. (in Chinese abbreviation, e.g. 創，出，利，民，申，⋯⋯)
   * @param {number} chap Chapter of the Book.
   * @param {string} vers Verses of the chapter, range is supported. (e.g. 1-3 / 1,3,7 / 1-5,10 / ...)
   */
  function BibleRef(abbr, chap, vers) {
    this.abbr = abbr;
    this.chap = chap;
    this.vers = vers;
    var refText = '(' + abbr + ' ' + chap + ':' + vers + ')';

    /**
     * Gets Bible text and attaches reference text at the end.
     * @param {function(string):void} success Callback for successfully getting bible text with reference attached.
     * @param {function(string):void} fail Callback for failed query, error message will be passed as argument.
     */
    this.getBibleTextWithRef = function (success, fail) {
      this.getBibleText(function (bibleText) {
        success(bibleText + refText);
      }, fail || success);
    };

    /**
     * Gets Bible text from cache if possible.
     */
    this.getBibleText = function (success, fail) {
      BibleRef.versesCache = BibleRef.versesCache || {};
      var cache = BibleRef.versesCache;
      if (cache.hasOwnProperty(refText)) {
        success(cache[refText]);
      } else {
        /* global chrome */
        chrome.runtime.sendMessage(
          { contentScriptQuery: 'queryVers', abbr: abbr, chap: chap, vers: vers, Resources: Resources },
          function (text) {
            cache[refText] = text;
            success(text);
          }
        );
      }
    };

    /**
     * Gets Bible text using FHL API and passes result to callback.
     * @param {function(string):void} success Callback for successfully getting bible text.
     * @param {function(string):void} fail Callback for failed query, error message will be passed as argument.
     */
    var getBibleTextFromFHL = function (success, fail) {
      var xhr = new XMLHttpRequest();
      xhr.onerror = function () {
        fail(Resources.err_cannot_connect);
      };
      try {
        var query = 'https://bible.fhl.net/json/qb.php?chineses=' + abbr
                  + '&chap=' + chap 
                  + '&sec=' + vers 
                  + '&gb=' + Resources.fhl_gb;
        xhr.open('GET', query, true);
        xhr.onload = function() {
          if (xhr.status !== 200) {
            fail(Resources.err_cannot_find_verse + 'XHR status = ' + xhr.status);
            return;
          }
          try {
            var resp = JSON.parse(xhr.responseText);
            if (resp.status !== 'success') {
              fail(Resources.err_cannot_find_verse + 'FHL response text = ' + xhr.responseText);
              return;
            } else if (resp.record.length === 0) {
              fail(Resources.err_no_record + refText + '？');
              return;
            }
            var versesText = '';
            var lastSec = 0;
            for (var i = 0; i < resp.record.length; i++) {
              var record = resp.record[i];
              // insert '⋯⋯' if verses are not continuous
              if (i > 0 && record.sec > lastSec + 1) {
                versesText += '⋯⋯';
              }
              lastSec = record.sec;
              versesText += record.bible_text;
            }
            success(versesText);
          } catch (err) {
            fail(Resources.err_cannot_find_verse + err);
          }
        };
        xhr.send();
      }
      catch (err) {
        fail(Resources.err_cannot_find_verse + err);
      }
    };
  }

  function AbbrResolver() {
    // traditional Chinese and simplified Chinese parser cannot exist at the same time,
    // because words like '出', '利', '伯' can both be traditional or simplified Chinese
    var books = Object.keys(Resources.abbr);
    // remove /[一二三]/ to avoid mismatch with '約一', '約二', '約三'
    var abbrs = books.map(function (book) { return Resources.abbr[book]; })
                     .filter(function (abbr) { return !abbr.match(/[一二三]/); });
    this.bibleBooks = books.concat(abbrs).join('|');
    this.toAbbr = function (book) { return Resources.abbr[book] || book; };
  }

  /**
   * Gets all text nodes inside the DOM tree of a node.
   * @param {Node} node A DOM node.
   * @returns {Node[]} List of text nodes.
   */
  function getTextNodesIn(node) {
    var textNodes = [];
    /**
     * Recursively collects all text nodes inside the DOM tree of a node.
     * @param {Node} node A DOM node.
     */
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

  /**
   * Replaces a old node with new nodes.
   * @param {Node} oldNode A node to be replaced.
   * @param {Node[]} newNodes New nodes to be inserted.
   */
  function replaceWithNodes(oldNode, newNodes) {
    for (var i = newNodes.length - 1; i > 0; i--) {
      oldNode.parentNode.insertBefore(newNodes[i], oldNode.nextSibling);
    }
    oldNode.parentNode.replaceChild(newNodes[0], oldNode);
  }
}(window.ezraLinkifier = window.ezraLinkifier || {}));