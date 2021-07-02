// Preview Images Function
function imagesPreview(input, placeToInsertImagePreview) {
	if (input.files) {
		let filesAmount = input.files.length;
		for (i = filesAmount - 1; i < filesAmount; i++) {
			let reader = new FileReader();
			reader.onload = function (event) {
				//$($.parseHTML("<img>"))
				$("#Profile_Image")
					.attr("src", event.target.result);
				//.appendTo(placeToInsertImagePreview);
			};
			reader.readAsDataURL(input.files[i]);
		}
	}
};

// Article Delete Function 
function deleteArticle(e) {
	$target = $(e.target);
	const id = $target.attr('data-id');
	// delete request
	fetch(`/articles/${id}`, { method: 'DELETE' })
		.then(response => {
			alert('Article Deleted');
			window.location.href = '/';
		})
		.catch(err => console.error(err))
}

// Event Listeners

document.addEventListener('DOMContentLoaded', function () {
	// Delete article
	$('.delete-article').on('click', deleteArticle);

	// Image Preview
	$("#input-files").on("change", function () {
		imagesPreview(this, "div.preview-images");
	});

	$(document).ready(function () {
		$('li.active').removeClass('active');
		$('a[href="' + location.pathname + '"]').closest('li').addClass('active');
	});
});