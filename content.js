// chrome.runtime.sendMessage({type: 'checkForDuplicateTabs', url: window.location.href});

function onDomMutation(mutationsList, observer) {
	for (const mutation of mutationsList) {
		if (mutation.type === 'childList') {
			// console.log(mutation);

			const links = document.querySelectorAll('a');
			const watchLinks = Array.from(links).filter(link => link.textContent === '視聴');
			watchLinks.forEach(link => {
				if (link && chrome.runtime) {
					chrome.runtime.sendMessage({ action: "openNewStream", value: link.href });
					return;
				}
			});
		}
	}
}

const targetNode = document.body;
const config = { childList: true, subtree: true };
const observer = new MutationObserver(onDomMutation);

observer.observe(targetNode, config);