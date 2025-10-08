// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract AKCLibraryPass is ERC721URIStorage, Ownable {
    uint256 public nextTokenId;

    constructor() ERC721("AKC Library Pass", "AKCPASS") Ownable(msg.sender) {}

    function mintSelf() public {
        require(balanceOf(msg.sender) == 0, "You already own the NFT.");
        uint256 tokenId = nextTokenId;
        _safeMint(msg.sender, tokenId);
        _setTokenURI(
            tokenId,
            "ipfs://bafkreigqkdojdyr6uw7gvqm2ald43fmce7hxwylhe2tzcmrlwxpsx7dam4"
        ); // ← 請換成你的 metadata URI
        nextTokenId++;
    }
    function hasNFT(address user) public view returns (bool) {
        return balanceOf(user) > 0;
    }
    // 💀 禁止 Approve（防止 transfer）
    function approve(
        address to,
        uint256 tokenId
    ) public virtual override(ERC721, IERC721) {
        revert("Soulbound: cannot approve transfers.");
    }
    function setApprovalForAll(
        address operator,
        bool approved
    ) public virtual override(ERC721, IERC721) {
        revert("Soulbound: cannot approve transfers.");
    }
    // 💀 禁止 Transfer
    function transferFrom(
        address from,
        address to,
        uint256 tokenId
    ) public virtual override(ERC721, IERC721) {
        revert("Soulbound: cannot approve transfers.");
    }

    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId,
        bytes memory data
    ) public virtual override(ERC721, IERC721) {
        revert("Soulbound: transfers disabled");
    }
}
