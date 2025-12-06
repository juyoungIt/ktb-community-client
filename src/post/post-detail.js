import {loadUserProfile} from "../getUserProfile.js";
import {showConfirmModal, showDangerChoiceModal} from "../modal.js";
import {callApi} from "../api/api.js";

document.addEventListener('DOMContentLoaded', async () => {

    // --- 전역 변수 및 요소 선택 ---
    const urlParams = new URLSearchParams(window.location.search);
    const postId = urlParams.get('id');
    const commentListContainer = document.getElementById('comment-list-container');
    const commentForm = document.getElementById('comment-form');
    const commentTextarea = document.getElementById('comment-textarea');
    const commentObserverTarget = document.getElementById('comment-observer-target');
    const likeBox = document.getElementById('like-box');
    const likeCountEl = document.getElementById('like-count');
    let currentUser = null;

    // --- 댓글 인피니티 스크롤 상태 변수 ---
    let isCommentLoading = false;
    let nextCommentCursor = null;
    const COMMENT_PAGE_SIZE = 10; // 한 번에 불러올 댓글 수

    let isLiked = false; // 현재 사용자의 좋아요 여부
    let isLikeProcessing = false; // 좋아요 API 중복 호출 방지

    const userProfile = await loadUserProfile();

    // 게시글 ID가 없으면 목록 페이지로 리다이렉트합니다.
    if (!postId) {
        await showConfirmModal('오류', '잘못된 접근입니다.');
        window.location.href = '/pages/posts.html';
        return;
    }

    // --- 데이터 렌더링 함수 ---

    /** 게시글 데이터를 HTML에 채워넣는 함수 */
    function renderPost(post) {
        document.getElementById('post-title').textContent = post.title;
        document.getElementById('author-profile-image').src = post.writer.profileImageUrl || 'https://placehold.co/48x48/6c757d/white?text=UN';
        document.getElementById('author-nickname').textContent = post.writer.nickname;
        document.getElementById('post-created-at').textContent = new Date(post.createdAt).toLocaleString();
        document.getElementById('post-content').innerHTML = post.content.replace(/\n/g, '<br>');

        document.getElementById('like-count').textContent = post.likeCount;
        document.getElementById('view-count').textContent = post.viewCount;
        document.getElementById('comment-count').textContent = post.commentCount;

        isLiked = post.isLiked || false;
        if (isLiked) {
            likeBox.classList.add('liked');
        } else {
            likeBox.classList.remove('liked');
        }

        const carouselInner = document.getElementById('carousel-inner-container');
        const carouselContainer = document.getElementById('post-images-carousel');
        post.postImages.sort((a, b) => a.sequence - b.sequence);
        if (post.postImages && post.postImages.length > 0) {
            carouselContainer.classList.remove('d-none'); // 숨김 해제 (보여주기)
            carouselInner.innerHTML = '';
            post.postImages.forEach((image, index) => {
                const item = document.createElement('div');
                item.className = `carousel-item ${index === 0 ? 'active' : ''}`;
                item.innerHTML = `<img src="${image.postImageUrl}" class="d-block w-100" alt="Post image ${index + 1}">`;
                carouselInner.appendChild(item);
            });
        } else {
            carouselContainer.classList.add('d-none');
        }

        if (userProfile.payload.email === post.writer.email) {
            const controls = document.getElementById('author-controls');
            controls.classList.remove('d-none');
            document.getElementById('edit-post-btn').href = `/pages/edit-post.html?id=${postId}`;
            document.getElementById('delete-post-btn').addEventListener('click', handleDeletePost);
        }
    }

    /** 댓글 하나에 대한 HTML 요소를 생성하는 함수 */
    function createCommentElement(comment) {
        const div = document.createElement('div');
        div.className = 'd-flex mb-4';
        div.setAttribute('data-comment-id', comment.commentId);
        // deletedAt 필드가 있으면 '삭제된 댓글' UI를 렌더링
        if (comment.deletedAt) {
            div.innerHTML = `
                <img src="https://placehold.co/40x40/e9ecef/6c757d?text=" class="comment-profile-img mt-1" alt="Deleted Comment">
                <div class="ms-3 w-100 d-flex align-items-center">
                    <p class="mt-1 mb-0 text-muted fst-italic">삭제된 댓글 입니다.</p>
                </div>
            `;
            return div;
        }
        const isAuthor = userProfile.payload.email === comment.writerInfo.email;
        div.innerHTML = `
            <img src="${comment.writerInfo.profileImageUrl || 'https://placehold.co/40x40/adb5bd/white?text=UN'}" class="comment-profile-img mt-1" alt="Commenter">
            <div class="ms-3 w-100">
                <div class="d-flex align-items-center">
                    <span class="fw-bold">${comment.writerInfo.nickname}</span>
                    <span class="text-muted small ms-3">${new Date(comment.createdAt).toLocaleString()}</span>
                    ${isAuthor ? `<div class="ms-auto d-flex gap-2">
                        <button class="btn btn-outline-primary btn-sm edit-comment-btn">수정</button>
                        <button class="btn btn-outline-danger btn-sm delete-comment-btn">삭제</button>
                    </div>` : ''}
                </div>
                <p class="mt-1 mb-0 comment-content">${comment.content}</p>
            </div>
        `;
        if (isAuthor) {
            div.querySelector('.delete-comment-btn').addEventListener('click', () => handleDeleteComment(comment.commentId));
            div.querySelector('.edit-comment-btn').addEventListener('click', (e) => handleEditComment(e.currentTarget, comment));
        }
        return div;
    }

    // --- API 호출 및 이벤트 핸들러 ---

    /** 게시글 상세 정보 가져오기 */
    async function fetchPostDetail() {
        try {
            const response = await callApi(`/posts/${postId}?isEdit=false`, {
                credentials: 'include'
            });
            const data = await response.json();
            if (!data.isSuccess) throw new Error('게시글을 불러오는 데 실패했습니다.');
            const post = data.payload;
            renderPost(post);
        } catch (error) {
            const errorText = await error.message;
            await showConfirmModal('게시글 정보로딩 실패', errorText || '잠시 후 다시 시도해주세요.');
            window.location.href = '/pages/posts.html';
        }
    }

    /** 댓글 목록 가져오기 (인피니티 스크롤) */
    async function fetchComments() {
        if (isCommentLoading) return;
        isCommentLoading = true;
        const spinner = commentObserverTarget.querySelector('.spinner-border');
        if (spinner) spinner.style.display = 'block';

        try {
            let url = `/posts/${postId}/comments?size=${COMMENT_PAGE_SIZE}`;
            if (nextCommentCursor === null) {
                url += `&cursor=0`;
            } else {
                url += `&cursor=${nextCommentCursor}`;
            }

            const response = await callApi(url, {
                credentials: 'include'
            });
            const comments = await response.json();
            if (!comments.isSuccess) throw new Error('댓글을 불러오는 데 실패했습니다.');

            comments.payload.forEach(comment => {
                const commentElement = createCommentElement(comment);
                commentListContainer.appendChild(commentElement);
            });

            if (comments.payload.length > 0) {
                nextCommentCursor = comments.payload[comments.payload.length - 1].commentId;
            }

            if (comments.payload.length < COMMENT_PAGE_SIZE) {
                commentObserver.unobserve(commentObserverTarget);
                commentObserverTarget.innerHTML = '<p class="text-muted">더 이상 댓글이 없습니다.</p>';
            }
        } catch (error) {
            commentObserverTarget.innerHTML = `<p class="text-danger">${error.message}</p>`;
        } finally {
            isCommentLoading = false;
            const spinner = commentObserverTarget.querySelector('.spinner-border');
            if(spinner) spinner.style.display = 'none';
        }
    }

    /** 댓글 목록을 처음부터 다시 불러오는 함수 */
    async function refreshComments() {
        commentListContainer.innerHTML = '';
        nextCommentCursor = null;
        isCommentLoading = false;
        commentObserverTarget.innerHTML = '<div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div>';
        commentObserver.observe(commentObserverTarget);
    }

    /** 게시글 삭제 처리 */
    async function handleDeletePost() {
        if (!(await showDangerChoiceModal('게시글 삭제', '게시글을 삭제하시겠습니까? 삭제된 게시글을 복구할 수 없습니다.'))) return;

        try {
            const response = await callApi(`/posts/${postId}`, {
                method: 'DELETE',
                credentials: 'include',
                requireAuth: true
            });

            if (response.ok) {
                await showConfirmModal('게시글 삭제', '게시글이 삭제되었습니다.');
                window.location.href = '/pages/posts.html';
            } else {
                await showConfirmModal('게시글 삭제', '게시글 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.');
            }
        } catch (error) {
            await showConfirmModal('게시글 삭제', '게시글 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.');
        }
    }

    /** 댓글 등록 처리 */
    commentForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const content = commentTextarea.value.trim();
        if (!content) return;

        try {
            const request = {
                memberId: 1,
                parentCommentId: null,
                content: content
            }
            const response = await callApi(`/posts/${postId}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(request)
            });
            const data = await response.json();

            if (data.isSuccess) {
                commentTextarea.value = '';
                await refreshComments();
                const commentCountEl = document.getElementById('comment-count');
                commentCountEl.textContent = parseInt(commentCountEl.textContent) + 1;
            } else {
                const errorText = data.message;
                await showConfirmModal('댓글 등록 실패', errorText || '댓글 등록에 실패했습니다.');
            }
        } catch (error) {
            await showConfirmModal('댓글 등록 실패', error.message || '댓글 등록에 실패했습니다.');
        }
    });

    /** 댓글 삭제 처리 */
    async function handleDeleteComment(commentId) {
        if (!(await showDangerChoiceModal('댓글 삭제', '댓글을 삭제하시겠습니까? 삭제한 댓글은 복원할 수 없습니다.'))) return;

        try {
            const response = await callApi(`/posts/comments/${commentId}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            const data = await response.json();
            if (data.isSuccess) {
                await refreshComments();
                const commentCountEl = document.getElementById('comment-count');
                commentCountEl.textContent = parseInt(commentCountEl.textContent) - 1;
            } else {
                await showConfirmModal('댓글 삭제 실패', '댓글 삭제에 실패했습니다.');
            }
        } catch (error) {
            await showConfirmModal('댓글 삭제 실패', error.message || '댓글 삭제에 실패했습니다.');
        }
    }

    /** 댓글 수정 UI 토글 및 처리 */
    function handleEditComment(editButton, comment) {
        const commentDiv = editButton.closest('.d-flex.mb-4');
        const contentP = commentDiv.querySelector('.comment-content');
        const originalContent = contentP.textContent;

        const buttonContainer = editButton.parentElement;
        const deleteButton = buttonContainer.querySelector('.delete-comment-btn');

        editButton.disabled = true;
        if (deleteButton) {
            deleteButton.disabled = true;
        }

        contentP.innerHTML = `
            <textarea class="form-control form-control-sm mb-2">${originalContent}</textarea>
            <div class="d-flex justify-content-end gap-2">
                <button class="btn btn-secondary btn-sm cancel-edit-btn">취소</button>
                <button class="btn btn-primary btn-sm save-edit-btn">저장</button>
            </div>
        `;

        const textarea = contentP.querySelector('textarea');
        const saveBtn = contentP.querySelector('.save-edit-btn');
        const cancelBtn = contentP.querySelector('.cancel-edit-btn');

        cancelBtn.addEventListener('click', () => {
            contentP.innerHTML = originalContent; // 원래 텍스트로 복구
            editButton.disabled = false;
            if (deleteButton) {
                deleteButton.disabled = false;
            }
        });

        saveBtn.addEventListener('click', async () => {
            const newContent = textarea.value.trim();
            if (!newContent || newContent === originalContent) {
                contentP.innerHTML = originalContent;
                editButton.disabled = false;
                if (deleteButton) {
                    deleteButton.disabled = false;
                }
                return;
            }

            try {
                const response = await callApi(`/posts/comments/${comment.commentId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ content: newContent })
                });
                const data = await response.json();
                if (data.isSuccess) {
                    contentP.innerHTML = newContent; // 성공 시 새 내용으로 교체
                } else {
                    await showConfirmModal('댓글 수정 실패', '댓글 수정에 실패했습니다.');
                }
            } catch (error) {
                await showConfirmModal('댓글 수정 실패', '댓글 수정에 실패했습니다.');
                contentP.innerHTML = originalContent; // 실패 시 원래 내용으로 복구
            } finally {
                editButton.disabled = false;
                if (deleteButton) {
                    deleteButton.disabled = false;
                }
            }
        });
    }

    /** 좋아요 버튼 이벤트 처리 */
    async function handleLikeToggle() {
        if (isLikeProcessing) return; // 중복 요청 방지
        isLikeProcessing = true;
        try {
            let url = `/posts/${postId}/like?type=` + (isLiked ? 'CANCEL' : 'LIKE');
            const response = await callApi(url, {
                method: 'PATCH',
                credentials: 'include'
            });
            const data = await response.json();

            if (!data.isSuccess) {
                await showConfirmModal('오류 발생', data.message);
            }

            isLiked = !isLiked; // 상태 토글

            likeBox.classList.toggle('liked', isLiked);

            requestAnimationFrame(() => {
                const currentCount = parseInt(likeCountEl.textContent);
                likeCountEl.innerHTML = isLiked ? currentCount + 1 : currentCount - 1;
            });

        } catch (error) {
            await showConfirmModal('오류 발생', '좋아요 처리에 실패했습니다.');
        } finally {
            isLikeProcessing = false; // 처리 완료
        }
    }

    // --- Intersection Observer 설정 ---
    const commentObserver = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && !isCommentLoading) {
            fetchComments();
        }
    }, { threshold: 0.1 });

    // --- 페이지 초기화 실행 ---
    fetchPostDetail();
    commentObserver.observe(commentObserverTarget); // 댓글 로딩 시작
    likeBox.addEventListener('click', handleLikeToggle); // [추가] 좋아요 클릭 이벤트 리스너
});

